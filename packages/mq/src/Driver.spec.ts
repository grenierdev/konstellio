import 'mocha';
import { use, expect, should } from 'chai';
use(require("chai-as-promised"));
should();
import { Driver, Message } from './Driver';
import { Disposable } from '@konstellio/disposable';

function wait(ms: number): Promise<void> {
	return new Promise(resolve => setTimeout(resolve, ms));
}

export function driverShouldBehaveLikeAMessageQueue(driver: Driver) {

	describe('Base driver', function () {
		this.timeout(10000);

		it('can publish to channel', async () => {
			await driver.publish('foo1', { foo: 'bar' }).should.be.fulfilled;
		});

		it('can subscribe to channel', async () => {
			let count = 0;

			const subscriber1 = await driver.subscribe('foo2', (msg) => {
				count += msg.add as number;
			});
			expect(subscriber1).to.be.an.instanceOf(Disposable);

			await driver.publish('foo2', { add: 1 });
			await wait(500);
			expect(count).to.equal(1);

			const subscriber2 = await driver.subscribe('foo2', (msg) => {
				count += msg.add as number;
			});
			expect(subscriber2).to.be.an.instanceOf(Disposable);

			await driver.publish('foo2', { add: 2 });
			await wait(500);
			expect(count).to.equal(5);
		});

		it('can unsubscribe', async () => {
			let count = 0;

			const subscriber1 = await driver.subscribe('foo3', (msg) => {
				count += msg.add as number;
			});
			expect(subscriber1).to.be.an.instanceOf(Disposable);

			await driver.publish('foo3', { add: 1 });
			await wait(500);
			expect(count).to.equal(1);

			subscriber1.dispose();

			await driver.publish('foo3', { add: 2 });
			await wait(500);
			expect(count).to.equal(1);
		});

		it('can send task', async () => {
			await driver.send('bar1', { bar: 'foo' }).should.be.fulfilled;
		});

		it('can consume task', async () => {
			let count = 0;

			const consumer = await driver.consume('bar2', (msg) => {
				++count;
			});
			expect(consumer).to.be.an.instanceOf(Disposable);

			await driver.send('bar2', {  });
			await wait(500);
			expect(count).to.equal(1);
		});

		it('can stop consuming task', async () => {
			let count = 0;

			const consumer = await driver.consume('bar3', (msg) => {
				++count;
			});
			expect(consumer).to.be.an.instanceOf(Disposable);

			await driver.send('bar3', {  });
			await wait(500);
			expect(count).to.equal(1);

			consumer.dispose();
			await driver.send('bar3', {  });
			await wait(500);
			expect(count).to.equal(1);
		});

		it('can get result from rpc', async () => {
			const consumer = await driver.consume('bar4', (msg) => {
				return { ts: Date.now(), bar: msg.bar };
			});
			expect(consumer).to.be.an.instanceOf(Disposable);

			const result = await driver.rpc('bar4', { bar: 'Hello World' }, 2000).should.be.fulfilled;
			expect(result.bar).to.equal('Hello World');
		});

		it('can get error from rpc', async () => {
			const consumer = await driver.consume('bar5', (msg) => {
				throw new Error('Fake error');
			});
			expect(consumer).to.be.an.instanceOf(Disposable);

			try {
				const result = await driver.rpc('bar5', { bar: 'Hello World' }, 2000).should.be.rejected;
			} catch (err) {
				expect(err.message).to.equal('Fake error');
			}
		});

		it('can consume pending task', async () => {
			let count = 0;

			await driver.send('bar6', {  });
			await wait(500);
			expect(count).to.equal(0);

			const consumer = await driver.consume('bar6', (msg) => {
				++count;
			});
			expect(consumer).to.be.an.instanceOf(Disposable);
			await wait(2000);
			expect(count).to.equal(1);
		});

	});

}