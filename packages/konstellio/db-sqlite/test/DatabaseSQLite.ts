import 'mocha';
import { use, expect, should } from 'chai';
use(require('chai-as-promised'));
should();
import { DatabaseSQLite } from '../src/DatabaseSQLite';
import {
	q,
	ColumnType,
	IndexType,
	QuerySelectResult,
	QueryShowCollectionResult,
	QueryCollectionExistsResult,
	QueryDescribeCollectionResult,
} from '@konstellio/db';
import { mkdtempSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

describe('SQLite', () => {
	type Foo = {
		title: string;
		postDate: Date;
		likes: number;
	};

	let driver: DatabaseSQLite;

	before(function(done) {
		this.timeout(10000);

		const tmp = mkdtempSync(join(tmpdir(), 'konstellio-db-sqlite-'));

		driver = new DatabaseSQLite({
			filename: ':memory:',
			// filename: join(tmp, 'test.sqlite')
		});

		driver
			.connect()
			.then(() => driver.transaction())
			.then(transaction => {
				transaction.execute(
					'CREATE TABLE Bar_Foo (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT, postDate TEXT, likes INTEGER)'
				);
				transaction.execute('CREATE INDEX Bar_Foo_postDate ON Bar_Foo (postDate ASC, likes ASC)');
				transaction.execute('CREATE INDEX Bar_Foo_title ON Bar_Foo (title ASC)');
				return transaction.commit();
			})
			.then(() => done());
	});

	it('insert', async () => {
		const transaction = await driver.transaction();

		transaction.execute(
			q.insert(q.collection('Foo', 'Bar')).add({
				title: 'Hello world',
				postDate: new Date(),
				likes: 10,
			})
		);

		await transaction.commit().should.be.fulfilled;
	});

	it('update', async () => {
		const transaction = await driver.transaction();

		transaction.execute(
			q
				.update(q.collection('Foo', 'Bar'))
				.set({ likes: 11 })
				.where(q.eq('title', 'Hello world'))
		);

		await transaction.commit().should.be.fulfilled;
	});

	it('select', async () => {
		const select = q
			.select()
			.from(q.collection('Foo', 'Bar'))
			.range({ limit: 1 });

		const result: QuerySelectResult<any> = await driver.execute<Foo>(select).should.be.fulfilled;
		expect(result).to.be.an.instanceOf(QuerySelectResult);
	});

	it('variable', async () => {
		const select = q
			.select()
			.from(q.collection('Foo', 'Bar'))
			.where(q.eq('title', q.var('title')));
		await driver.execute<Foo>(select).should.be.rejected;

		const result: QuerySelectResult<any> = await driver.execute<Foo>(select, { title: 'Hello world' }).should.be
			.fulfilled;
		expect(result).to.be.an.instanceOf(QuerySelectResult);
	});

	it('delete', async () => {
		const transaction = await driver.transaction();

		transaction.execute(q.delete(q.collection('Foo', 'Bar')).where(q.eq('title', 'Hello world')));

		await transaction.commit().should.be.fulfilled;
	});

	it('describe collection', async () => {
		const desc: QueryDescribeCollectionResult = await driver.execute(
			q.describeCollection(q.collection('Foo', 'Bar'))
		).should.be.fulfilled;
		expect(desc).to.be.an.instanceOf(QueryDescribeCollectionResult);
		expect(desc.columns.length).to.be.equal(4);
		expect(desc.columns[0].name).to.be.equal('id');
		expect(desc.columns[0].type).to.be.equal(ColumnType.Int);
		expect(desc.columns[0].defaultValue).to.be.equal(null);
		expect(desc.columns[0].autoIncrement).to.be.equal(true);
		expect(desc.columns[1].name).to.be.equal('title');
		expect(desc.columns[1].type).to.be.equal(ColumnType.Text);
		expect(desc.columns[1].defaultValue).to.be.equal(null);
		expect(desc.columns[1].autoIncrement).to.be.equal(false);
		expect(desc.columns[2].name).to.be.equal('postDate');
		expect(desc.columns[2].type).to.be.equal(ColumnType.Text);
		expect(desc.columns[2].defaultValue).to.be.equal(null);
		expect(desc.columns[2].autoIncrement).to.be.equal(false);
		expect(desc.columns[3].name).to.be.equal('likes');
		expect(desc.columns[3].type).to.be.equal(ColumnType.Int);
		expect(desc.columns[3].defaultValue).to.be.equal(null);
		expect(desc.columns[3].autoIncrement).to.be.equal(false);
		expect(desc.indexes.length).to.be.equal(3);
		expect(desc.indexes[0].name).to.be.equal('Bar_Foo_id');
		expect(desc.indexes[0].type).to.be.equal(IndexType.Primary);
		expect(desc.indexes[0].columns.count()).to.be.equal(1);
		expect(desc.indexes[0].columns.get(0).toString()).to.be.equal('id ASC');
		expect(desc.indexes[1].name).to.be.equal('Bar_Foo_title');
		expect(desc.indexes[1].type).to.be.equal(IndexType.Index);
		expect(desc.indexes[1].columns.count()).to.be.equal(1);
		expect(desc.indexes[1].columns.get(0).toString()).to.be.equal('title ASC');
		expect(desc.indexes[2].name).to.be.equal('Bar_Foo_postDate');
		expect(desc.indexes[2].type).to.be.equal(IndexType.Index);
		expect(desc.indexes[2].columns.count()).to.be.equal(2);
		expect(desc.indexes[2].columns.get(0).toString()).to.be.equal('postDate ASC');
		expect(desc.indexes[2].columns.get(1).toString()).to.be.equal('likes ASC');
	});

	it('create collection', async () => {
		const create = q
			.createCollection(q.collection('Moo', 'Joo'))
			.define(
				[
					q.column('id', ColumnType.UInt, 64, null, true),
					q.column('title', ColumnType.Text),
					q.column('date', ColumnType.Date),
				],
				[
					q.index('Joo_Moo_id', IndexType.Primary, [q.sort(q.field('id'), 'asc')]),
					q.index('Joo_Moo_date', IndexType.Unique, [
						q.sort(q.field('id'), 'asc'),
						q.sort(q.field('date'), 'desc'),
					]),
				]
			);

		const transaction = await driver.transaction();

		transaction.execute(create);

		await transaction.commit().should.be.fulfilled;

		const desc: QueryDescribeCollectionResult = await driver.execute(
			q.describeCollection(q.collection('Moo', 'Joo'))
		).should.be.fulfilled;
		expect(desc.columns.length).to.be.equal(3);
		expect(desc.columns[0].name).to.be.equal('id');
		expect(desc.columns[0].type).to.be.equal(ColumnType.Int);
		expect(desc.columns[0].defaultValue).to.be.equal(null);
		expect(desc.columns[0].autoIncrement).to.be.equal(true);
		expect(desc.columns[1].name).to.be.equal('title');
		expect(desc.columns[1].type).to.be.equal(ColumnType.Text);
		expect(desc.columns[1].defaultValue).to.be.equal(null);
		expect(desc.columns[1].autoIncrement).to.be.equal(false);
		expect(desc.columns[2].name).to.be.equal('date');
		expect(desc.columns[2].type).to.be.equal(ColumnType.Text);
		expect(desc.columns[2].defaultValue).to.be.equal(null);
		expect(desc.columns[2].autoIncrement).to.be.equal(false);
		expect(desc.indexes.length).to.be.equal(2);
		expect(desc.indexes[0].name).to.be.equal('Joo_Moo_id');
		expect(desc.indexes[0].type).to.be.equal(IndexType.Primary);
		expect(desc.indexes[0].columns.count()).to.be.equal(1);
		expect(desc.indexes[0].columns.get(0).toString()).to.be.equal('id ASC');
		expect(desc.indexes[1].name).to.be.equal('Joo_Moo_date');
		expect(desc.indexes[1].type).to.be.equal(IndexType.Unique);
		expect(desc.indexes[1].columns.count()).to.be.equal(2);
		expect(desc.indexes[1].columns.get(0).toString()).to.be.equal('id ASC');
		expect(desc.indexes[1].columns.get(1).toString()).to.be.equal('date DESC');
	});

	it('alter collection', async () => {
		const alter = q
			.alterCollection(q.collection('Moo', 'Joo'))
			.addColumn(q.column('content', ColumnType.Text))
			.alterColumn('date', q.column('postDate', ColumnType.Date))
			.dropColumn('title')
			.addIndex(q.index('Joo_Moo_content', IndexType.Index, [q.sort(q.field('content'), 'asc')]))
			.dropIndex('Joo_Moo_date')
			.rename(q.collection('Moo', 'Boo'));

		const transaction = await driver.transaction();

		transaction.execute(alter);

		await transaction.commit().should.be.fulfilled;

		const desc: QueryDescribeCollectionResult = await driver.execute(
			q.describeCollection(q.collection('Moo', 'Boo'))
		).should.be.fulfilled;
		expect(desc.columns.length).to.be.equal(3);
		expect(desc.columns[0].name).to.be.equal('id');
		expect(desc.columns[0].type).to.be.equal(ColumnType.Int);
		expect(desc.columns[0].defaultValue).to.be.equal(null);
		expect(desc.columns[0].autoIncrement).to.be.equal(true);
		expect(desc.columns[1].name).to.be.equal('postDate');
		expect(desc.columns[1].type).to.be.equal(ColumnType.Text);
		expect(desc.columns[1].defaultValue).to.be.equal(null);
		expect(desc.columns[1].autoIncrement).to.be.equal(false);
		expect(desc.columns[2].name).to.be.equal('content');
		expect(desc.columns[2].type).to.be.equal(ColumnType.Text);
		expect(desc.columns[2].defaultValue).to.be.equal(null);
		expect(desc.columns[2].autoIncrement).to.be.equal(false);
		expect(desc.indexes.length).to.be.equal(2);
		expect(desc.indexes[0].name).to.be.equal('Boo_Moo_id');
		expect(desc.indexes[0].type).to.be.equal(IndexType.Primary);
		expect(desc.indexes[0].columns.count()).to.be.equal(1);
		expect(desc.indexes[0].columns.get(0).toString()).to.be.equal('id ASC');
		expect(desc.indexes[1].name).to.be.equal('Joo_Moo_content');
		expect(desc.indexes[1].type).to.be.equal(IndexType.Index);
		expect(desc.indexes[1].columns.count()).to.be.equal(1);
		expect(desc.indexes[1].columns.get(0).toString()).to.be.equal('content ASC');
	});

	it('exists collection', async () => {
		let result: QueryCollectionExistsResult = await driver.execute(q.collectionExists(q.collection('Moo', 'Boo')))
			.should.be.fulfilled;
		expect(result).to.be.an.instanceOf(QueryCollectionExistsResult);
		expect(result.exists).to.equal(true);

		result = await driver.execute(q.collectionExists(q.collection('Foo', 'Joo'))).should.be.fulfilled;
		expect(result).to.be.an.instanceOf(QueryCollectionExistsResult);
		expect(result.exists).to.equal(false);
	});

	it('describe collection', async () => {
		const result: QueryShowCollectionResult = await driver.execute(q.showCollection()).should.be.fulfilled;
		expect(result).to.be.an.instanceOf(QueryShowCollectionResult);
		expect(result.collections.length).to.equal(2);
		expect(result.collections[0].toString()).to.equal('Bar__Foo');
		expect(result.collections[1].toString()).to.equal('Boo__Moo');
	});

	it('drop collection', async () => {
		const transaction = await driver.transaction();

		transaction.execute(q.dropCollection(q.collection('Moo', 'Boo')));

		await transaction.commit().should.be.fulfilled;
	});
});
