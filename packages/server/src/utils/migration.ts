import { q, Compare, Column, ColumnType, Index, IndexType, AlterCollectionQuery, CreateCollectionQuery, CreateCollectionQueryResult, AlterCollectionQueryResult, DescribeCollectionQueryResult, SortableField } from '@konstellio/db';
import { DocumentNode } from 'graphql';
import { parseSchema, Schema, Field, Index as SchemaIndex } from '../utils/schema';
import { Plugin, PluginInitContext } from './plugin';
import { WriteStream, ReadStream } from 'tty';
import { promptSelection } from './cli';

function defaultIndexHandle(collection: string, handle: string | undefined, type: IndexType, fields: { [fieldHandle: string]: 'asc' | 'desc' }) {
	return handle || `${collection}_${Object.keys(fields).join('_')}_${type === IndexType.Primary ? 'pk' : (type === IndexType.Unique ? 'uniq' : 'idx')}`
}

export type SchemaDescription = {
	handle: string
	columns: SchemaDescriptionColumn[]
	indexes: SchemaDescriptionIndex[]
}

export type SchemaDescriptionColumn = {
	handle: string,
	type: string
}

export type SchemaDescriptionIndex = {
	handle: string
	type: string
	columns: { [handle: string]: 'asc' | 'desc' }
}

export type SchemaDiff = SchemaDiffAddCollection | SchemaDiffAddColumn | SchemaDiffDropColumn | SchemaDiffAlterColumn | SchemaDiffAddIndex | SchemaDiffDropIndex;

export type SchemaDiffAddCollection = {
	action: 'add_collection'
	collection: SchemaDescription
}

export type SchemaDiffAddColumn = {
	action: 'add_column'
	collection: SchemaDescription
	column: SchemaDescriptionColumn
	copyColumn: string[]
}

export type SchemaDiffDropColumn = {
	action: 'drop_column'
	collection: SchemaDescription
	column: SchemaDescriptionColumn
}

export type SchemaDiffAlterColumn = {
	action: 'alter_column'
	collection: SchemaDescription
	column: SchemaDescriptionColumn
	type: string
}

export type SchemaDiffAddIndex = {
	action: 'add_index'
	collection: SchemaDescription
	index: SchemaDescriptionIndex
}

export type SchemaDiffDropIndex = {
	action: 'drop_index'
	collection: SchemaDescription
	index: SchemaDescriptionIndex
}

function matchLocalizedHandle(handle: string): RegExpMatchArray | null {
	return handle.match(/^([a-zA-Z0-9_-]+)__([a-z]{2}(-[a-zA-Z]{2})?)$/i);
}

export async function getSchemaDiff(context: PluginInitContext, schemas: Schema[]): Promise<SchemaDiff[]> {

	const { database } = context;
	const diffs: SchemaDiff[] = [];

	for (let i = 0, l = schemas.length; i < l; ++i) {
		const schema = schemas[i];
		const schemaDesc = schemaToSchemaDescription(context, schema);
		const exists = await database.execute(q.collectionExists(schema.handle));

		if (exists.exists === false) {
			diffs.push({
				action: 'add_collection',
				collection: schemaDesc
			});
		} else {
			const desc = await database.execute(q.describeCollection(schema.handle));
			const dbSchemaDesc = databaseDescriptionToSchemaDescription(context, desc);
			const mutedFields: string[] = [];
			const mutedIndexes: string[] = [];

			dbSchemaDesc.columns.forEach(dbColumn => {
				const column = schemaDesc.columns.find(column => column.handle === dbColumn.handle);
				if (column === undefined) {
					diffs.push({
						action: 'drop_column',
						collection: schemaDesc,
						column: dbColumn
					});
				}
				else if ((database.compareTypes(mapStringToColumnType(column.type), mapStringToColumnType(dbColumn.type)) & Compare.Castable) === 0) {
					mutedFields.push(column.handle);
					diffs.push({
						action: 'alter_column',
						collection: schemaDesc,
						column: dbColumn,
						type: column.type
					});
				}
				else {
					mutedFields.push(column.handle);
				}
			});
			schemaDesc.columns.forEach(column => {
				if (mutedFields.indexOf(column.handle) === -1) {
					const match = matchLocalizedHandle(column.handle);
					diffs.push({
						action: 'add_column',
						collection: schemaDesc,
						column: column,
						copyColumn: match
							? dbSchemaDesc.columns.map(column => column.handle).filter(handle => { const m2 = matchLocalizedHandle(handle); return m2 && m2[1] === match[1]; })
							: dbSchemaDesc.columns.map(column => column.handle)
					});
				}
			});
			
			dbSchemaDesc.indexes.forEach(dbIndex => {
				const index = schemaDesc.indexes.find(index => index.handle === dbIndex.handle);
				if (index === undefined) {
					mutedIndexes.push(dbIndex.handle);
					diffs.push({
						action: 'drop_index',
						collection: schemaDesc,
						index: dbIndex
					});
				}
				else {
					mutedIndexes.push(dbIndex.handle);
				}
			});
			schemaDesc.indexes.forEach(index => {
				if (mutedIndexes.indexOf(index.handle) === -1) {
					diffs.push({
						action: 'add_index',
						collection: schemaDesc,
						index: index
					});
				}
			});
		}
	}

	return diffs;
}

export async function executeSchemaMigration(context: PluginInitContext, diffs: SchemaDiff[]): Promise<void>
export async function executeSchemaMigration(context: PluginInitContext, diffs: SchemaDiff[], stdin: ReadStream, stdout: WriteStream): Promise<void>
export async function executeSchemaMigration(context: PluginInitContext, diffs: SchemaDiff[], stdin?: ReadStream, stdout?: WriteStream): Promise<void> {
	const createCollections: CreateCollectionQuery[] = [];
	const alterCollections: Map<string, AlterCollectionQuery> = new Map();
	const muteNewColumn: string[] = [];

	diffs = diffs.sort((a, b) => {

		return 0;
	});

	for (let i = 0, l = diffs.length; i < l; ++i) {
		const diff = diffs[i];

		if (diff.action === 'add_collection') {
			const columns = diff.collection.columns
				.map<Column>(column => q.column(column.handle, mapStringToColumnType(column.type)));
			
			const indexes = diff.collection.indexes
				.map<Index>(index => {
					const columns = Object.keys(index.columns).map(name => {
						return q.sort(name, index.columns[name]);
					});
					return q.index(index.handle, mapStringToIndexType(index.type)).columns(...columns);
				});
			
			createCollections.push(q.createCollection(diff.collection.handle).columns(...columns).indexes(...indexes));
		}
		else if (diff.action === 'add_column') {
			const collectionHandle = diff.collection.handle;
			const columnName = `${collectionHandle}.${diff.column.handle}`;
			if (muteNewColumn.indexOf(columnName) === -1) {
				if (alterCollections.has(collectionHandle) === false) {
					alterCollections.set(
						collectionHandle,
						q.alterCollection(collectionHandle)
					);
				}

				let choice: string | undefined;

				if (diff.copyColumn.length > 0) {
					if (stdin && stdout) {
						const choices = ([['empty', `Leave \`${columnName}\` empty`]] as [string, string][])
							.concat(
								diff.copyColumn.map<[string, string]>(copy => ([copy, `Copy content from \`${collectionHandle}.${copy}\``])),
								[['abort', `Abort migration`]]
							);

						try {
							choice = await promptSelection(stdin, stdout, `Schema has a new field \`${columnName}\`, how do we initialize it?`, new Map(choices));
						} catch (err) {
							throw new Error(`User aborted migration.`);
						}

						if (choice === 'abort') {
							throw new Error(`User aborted migration.`);
						}

						else if (choice === 'empty') {
							choice = undefined;
						}
					} else {
						throw new Error(`Schema has some new additions that requires your intervention. Please use a TTY terminal.`);
					}
				}

				alterCollections.set(
					collectionHandle,
					alterCollections.get(collectionHandle)!.addColumn(q.column(diff.column.handle, mapStringToColumnType(diff.column.type)), choice)
				);
			}
		}
		else if (diff.action === 'alter_column') {
			const collectionHandle = diff.collection.handle;

			if (alterCollections.has(collectionHandle) === false) {
				alterCollections.set(collectionHandle, q.alterCollection(collectionHandle));
			}
			alterCollections.set(
				collectionHandle,
				alterCollections.get(collectionHandle)!.alterColumn(diff.column.handle, q.column(diff.column.handle, mapStringToColumnType(diff.type)))
			);
		}
		else if (diff.action === 'drop_column') {
			if (stdin && stdout) {
				const collectionHandle = diff.collection.handle;
				const columnName = `${collectionHandle}.${diff.column.handle}`;

				const choices: [string, string][] = [['drop', `Drop \`${columnName}\``], ['abort', `Abort migration`]];
				let choice: string | undefined;

				try {
					choice = await promptSelection(stdin, stdout, `Field \`${columnName}\` is no longer defined in schema, confirm deletion?`, new Map(choices));
				} catch (err) {
					throw new Error(`User aborted migration.`);
				}

				if (choice === 'abort') {
					throw new Error(`User aborted migration.`);
				}

				if (alterCollections.has(collectionHandle) === false) {
					alterCollections.set(collectionHandle, q.alterCollection(collectionHandle));
				}
				alterCollections.set(
					collectionHandle,
					alterCollections.get(collectionHandle)!.dropColumn(diff.column.handle)
				);
			} else {
				throw new Error(`Schema has some new deletions that requires your intervention. Please use a TTY terminal.`);
			}
		}
		else if (diff.action === 'add_index') {
			const collectionHandle = diff.collection.handle;
			const columns = Object.keys(diff.index.columns).map<SortableField>(handle => q.sort(handle, diff.index.columns[handle]));

			if (alterCollections.has(collectionHandle) === false) {
				alterCollections.set(collectionHandle, q.alterCollection(collectionHandle));
			}
			alterCollections.set(
				collectionHandle,
				alterCollections.get(collectionHandle)!.addIndex(q.index(diff.index.handle, mapStringToIndexType(diff.index.type)).columns(...columns))
			);
		}
		else if (diff.action === 'drop_index') {
			const collectionHandle = diff.collection.handle;

			if (alterCollections.has(collectionHandle) === false) {
				alterCollections.set(collectionHandle, q.alterCollection(collectionHandle));
			}
			alterCollections.set(
				collectionHandle,
				alterCollections.get(collectionHandle)!.dropIndex(diff.index.handle)
			);
		}
	}

	const queries: Promise<CreateCollectionQueryResult | AlterCollectionQueryResult>[] = createCollections.map(create => context.database.execute(create)).concat(Array.from(alterCollections.values()).map(alter => context.database.execute(alter)));

	await Promise.all(queries);
}

function schemaToSchemaDescription(context: PluginInitContext, schema: Schema): SchemaDescription {
	const locales = Object.keys(context.locales);
	return {
		handle: schema.handle,
		columns: schema.fields.reduce((columns, field) => {
			if (field.type === 'relation') {
				return columns;
			} else if (field.localized) {
				locales.forEach(code => {
					columns.push({ handle: `${field.handle}__${code}`, type: field.type })
				});
			} else {
				columns.push({ handle: field.handle, type: field.type });
			}
			return columns;
		}, [] as SchemaDescriptionColumn[]),
		indexes: schema.indexes.reduce((indexes, index) => {
			let localized = false;
			Object.keys(index.fields).forEach(name => {
				const field = schema.fields.find(f => f.handle === name);
				localized = localized || (field !== undefined && field.localized === true);
			});
			if (localized) {
				locales.forEach(code => {
					indexes.push({
						handle: `${index.handle}__${code}`,
						type: index.type,
						columns: Object.keys(index.fields).reduce((fields, name) => {
							const field = schema.fields.find(f => f.handle === name);
							if (field !== undefined && field.localized === true) {
								fields[`${name}__${code}`] = index.fields[name];
							} else {
								fields[name] = index.fields[name];
							}
							return fields;
						}, {})
					});
				});
			} else {
				indexes.push({
					handle: index.handle,
					type: index.type,
					columns: index.fields
				})
			}
			return indexes;
		}, [] as SchemaDescriptionIndex[])
	};
}

function databaseDescriptionToSchemaDescription(context: PluginInitContext, description: DescribeCollectionQueryResult): SchemaDescription {
	const locales = Object.keys(context.locales);

	return {
		handle: description.collection.toString(),
		columns: description.columns.reduce((columns, column) => {
			columns.push({
				handle: column.getName()!,
				type: mapColumnTypeToFieldType(column.getType()!)
			});
			return columns;
		}, [] as SchemaDescriptionColumn[]),
		indexes: description.indexes.reduce((indexes, index) => {
			const type = index.getType()!;
			const columns = index.getColumns()!;
			let handle = index.getName()!;
			const localized = columns.reduce((localized: boolean, column: SortableField) => {
				const match = matchLocalizedHandle(column.name);
				return localized || match !== null;
			}, false);
			indexes.push({
				handle: handle,
				type: type,
				columns: columns.reduce((columns: { [handle: string]: 'asc' | 'desc' }, field: SortableField) => {
					if (localized) {
						const match = matchLocalizedHandle(field.name);
						if (match) {
							columns[match[1]] = field.direction || 'asc';
						} else {
							columns[field.name] = field.direction || 'asc';
						}
					} else {
						columns[field.name] = field.direction || 'asc';
					}
					return columns!;
				}, {} as { [handle: string]: 'asc' | 'desc' })
			});
			return indexes;
		}, [] as SchemaDescriptionIndex[])
	};
}

function mapStringToColumnType(type: string): ColumnType {
	switch (type) {
		case 'int':
			return ColumnType.Int64;
		case 'float':
			return ColumnType.Float64;
		case 'text':
		case 'password':
		case 'slug':
		case 'html':
			return ColumnType.Text;
		case 'date':
			return ColumnType.DateTime;
		case 'datetime':
			return ColumnType.DateTime;
		default:
			throw new Error(`Unknown field type ${type}.`);
	}
}

function mapStringToIndexType(type: string): IndexType {
	switch (type) {
		case 'primary':
			return IndexType.Primary;
		case 'unique':
			return IndexType.Unique;
		case 'index':
			return IndexType.Index;
		default:
			throw new Error(`Unknown index type ${type}.`);
	}
}

function mapColumnTypeToFieldType(type: ColumnType): string {
	switch (type) {
		case ColumnType.Int8:
		case ColumnType.Int16:
		case ColumnType.Int32:
		case ColumnType.Int64:
			return 'int';
		case ColumnType.Float32:
		case ColumnType.Float64:
			return 'float';
		case ColumnType.Text:
			return 'text';
		case ColumnType.Date:
			return 'date';
		case ColumnType.DateTime:
			return 'datetime';
		case ColumnType.Blob:
			return 'blob';
		default:
			throw new Error(`Unknown field type ${type}.`);
	}
}

function mapIndexTypeToString(type: IndexType): string {
	switch (type) {
		case IndexType.Primary:
			return 'primary';
		case IndexType.Unique:
			return 'unique';
		case IndexType.Index:
			return 'index';
	}
}