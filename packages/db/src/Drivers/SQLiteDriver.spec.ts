import 'mocha';
import { use, expect, should } from 'chai';
use(require("chai-as-promised"));
should();
import { spawn, ChildProcess } from 'child_process';
import { SQLiteDriver } from './SQLiteDriver';
import { q, QueryNotSupportedError } from '../Query';
import * as QueryResult from '../QueryResult';
import { ColumnType, IndexType } from '../index';

describe('SQLite', () => {

	type Foo = {
		title: string
		postDate: Date
		likes: number
	}

	let driver: SQLiteDriver;

	before(function (done) {
		this.timeout(10000);

		driver = new SQLiteDriver({
			filename: ':memory:'
		});

		driver.connect()
		.then(() => driver.execute('CREATE TABLE Bar_Foo (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT, postDate TEXT, likes INTEGER)'))
		.then(() => driver.execute('CREATE INDEX Bar_Foo_postDate ON Bar_Foo (postDate ASC, likes ASC)'))
		.then(() => driver.execute('CREATE INDEX Bar_Foo_title ON Bar_Foo (title ASC)'))
		.then(() => done()).catch(done);
	});

	it('insert', async () => {

		const insert = q.insert('Foo', 'Bar').fields({
			title: 'Hello world',
			postDate: new Date(),
			likes: 10
		});

		const result: QueryResult.InsertQueryResult<any> = await driver.execute<Foo>(insert).should.be.fulfilled;
		expect(result).to.be.an.instanceOf(QueryResult.InsertQueryResult);
	});

	it('update', async () => {

		const update = q.update('Foo', 'Bar').fields({ likes: 11 }).eq('title', 'Hello world');//.limit(1);

		const result: QueryResult.UpdateQueryResult<any> = await driver.execute<Foo>(update).should.be.fulfilled;
		expect(result).to.be.an.instanceOf(QueryResult.UpdateQueryResult);
	});

	it('replace', async () => {

		const replace = q.replace('Foo', 'Bar').fields({ title: 'Goodbye world', likes: 11 }).eq('title', 'Hello world').limit(1);

		await driver.execute<Foo>(replace).should.be.rejectedWith(QueryNotSupportedError);
	});

	it('select', async () => {

		const select = q.select().from('Foo', 'Bar').limit(1);

		const result: QueryResult.SelectQueryResult<any> = await driver.execute<Foo>(select).should.be.fulfilled;
		expect(result).to.be.an.instanceOf(QueryResult.SelectQueryResult);
	});

	it('delete', async () => {

		const remove = q.delete('Foo', 'Bar').eq('title', 'Hello world');//.limit(1);

		const result: QueryResult.DeleteQueryResult = await driver.execute(remove).should.be.fulfilled;
		expect(result).to.be.an.instanceOf(QueryResult.DeleteQueryResult);
	});

	it('describe collection', async () => {

		const desc: QueryResult.DescribeCollectionQueryResult = await driver.execute(q.describeCollection('Foo', 'Bar')).should.be.fulfilled;
		expect(desc).to.be.an.instanceOf(QueryResult.DescribeCollectionQueryResult);
		expect(desc.columns.length).to.be.equal(4);
		expect(desc.columns[0].getName()).to.be.equal('id');
		expect(desc.columns[0].getType()).to.be.equal(ColumnType.Int64);
		expect(desc.columns[0].getDefaultValue()).to.be.equal(null);
		expect(desc.columns[0].getAutoIncrement()).to.be.equal(true);
		expect(desc.columns[1].getName()).to.be.equal('title');
		expect(desc.columns[1].getType()).to.be.equal(ColumnType.Text);
		expect(desc.columns[1].getDefaultValue()).to.be.equal(null);
		expect(desc.columns[1].getAutoIncrement()).to.be.equal(false);
		expect(desc.columns[2].getName()).to.be.equal('postDate');
		expect(desc.columns[2].getType()).to.be.equal(ColumnType.Text);
		expect(desc.columns[2].getDefaultValue()).to.be.equal(null);
		expect(desc.columns[2].getAutoIncrement()).to.be.equal(false);
		expect(desc.columns[3].getName()).to.be.equal('likes');
		expect(desc.columns[3].getType()).to.be.equal(ColumnType.Int64);
		expect(desc.columns[3].getDefaultValue()).to.be.equal(null);
		expect(desc.columns[3].getAutoIncrement()).to.be.equal(false);
		expect(desc.indexes.length).to.be.equal(3);
		expect(desc.indexes[0].getName()).to.be.equal('Bar_Foo_id');
		expect(desc.indexes[0].getType()).to.be.equal(IndexType.Primary);
		expect(desc.indexes[0].getColumns()!.count()).to.be.equal(1);
		expect(desc.indexes[0].getColumns()!.get(0).name).to.be.equal('id');
		expect(desc.indexes[0].getColumns()!.get(0).direction).to.be.equal('asc');
		expect(desc.indexes[1].getName()).to.be.equal('Bar_Foo_title');
		expect(desc.indexes[1].getType()).to.be.equal(IndexType.Index);
		expect(desc.indexes[1].getColumns()!.count()).to.be.equal(1);
		expect(desc.indexes[1].getColumns()!.get(0).name).to.be.equal('title');
		expect(desc.indexes[1].getColumns()!.get(0).direction).to.be.equal('asc');
		expect(desc.indexes[2].getName()).to.be.equal('Bar_Foo_postDate');
		expect(desc.indexes[2].getType()).to.be.equal(IndexType.Index);
		expect(desc.indexes[2].getColumns()!.count()).to.be.equal(2);
		expect(desc.indexes[2].getColumns()!.get(0).name).to.be.equal('postDate');
		expect(desc.indexes[2].getColumns()!.get(0).direction).to.be.equal('asc');
		expect(desc.indexes[2].getColumns()!.get(1).name).to.be.equal('likes');
		expect(desc.indexes[2].getColumns()!.get(1).direction).to.be.equal('asc');
	});

	it('create collection', async () => {

		const create = q.createCollection('Moo', 'Joo')
			.columns(
				q.column('id', ColumnType.UInt64, null, true),
				q.column('title', ColumnType.Text),
				q.column('date', ColumnType.Date)
			)
			.indexes(
				q.index('Joo_Moo_id', IndexType.Primary).columns(q.sort('id', 'asc')),
				q.index('Joo_Moo_date', IndexType.Unique).columns(q.sort('id', 'asc'), q.sort('date', 'desc'))
			)

		const result: QueryResult.CreateCollectionQueryResult = await driver.execute(create).should.be.fulfilled;
		expect(result).to.be.an.instanceOf(QueryResult.CreateCollectionQueryResult);

		const desc: QueryResult.DescribeCollectionQueryResult = await driver.execute(q.describeCollection('Moo', 'Joo')).should.be.fulfilled;
		expect(desc.columns.length).to.be.equal(3);
		expect(desc.columns[0].getName()).to.be.equal('id');
		expect(desc.columns[0].getType()).to.be.equal(ColumnType.Int64);
		expect(desc.columns[0].getDefaultValue()).to.be.equal(null);
		expect(desc.columns[0].getAutoIncrement()).to.be.equal(true);
		expect(desc.columns[1].getName()).to.be.equal('title');
		expect(desc.columns[1].getType()).to.be.equal(ColumnType.Text);
		expect(desc.columns[1].getDefaultValue()).to.be.equal(null);
		expect(desc.columns[1].getAutoIncrement()).to.be.equal(false);
		expect(desc.columns[2].getName()).to.be.equal('date');
		expect(desc.columns[2].getType()).to.be.equal(ColumnType.Text);
		expect(desc.columns[2].getDefaultValue()).to.be.equal(null);
		expect(desc.columns[2].getAutoIncrement()).to.be.equal(false);
		expect(desc.indexes.length).to.be.equal(2);
		expect(desc.indexes[0].getName()).to.be.equal('Joo_Moo_id');
		expect(desc.indexes[0].getType()).to.be.equal(IndexType.Primary);
		expect(desc.indexes[0].getColumns()!.count()).to.be.equal(1);
		expect(desc.indexes[0].getColumns()!.get(0).name).to.be.equal('id');
		expect(desc.indexes[0].getColumns()!.get(0).direction).to.be.equal('asc');
		expect(desc.indexes[1].getName()).to.be.equal('Joo_Moo_date');
		expect(desc.indexes[1].getType()).to.be.equal(IndexType.Unique);
		expect(desc.indexes[1].getColumns()!.count()).to.be.equal(2);
		expect(desc.indexes[1].getColumns()!.get(0).name).to.be.equal('id');
		expect(desc.indexes[1].getColumns()!.get(0).direction).to.be.equal('asc');
		expect(desc.indexes[1].getColumns()!.get(1).name).to.be.equal('date');
		expect(desc.indexes[1].getColumns()!.get(1).direction).to.be.equal('desc');
	});

	it('alter collection', async () => {

		const alter = q.alterCollection('Moo', 'Joo')

	});

});