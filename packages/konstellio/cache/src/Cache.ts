import { IDisposableAsync } from '@konstellio/disposable';

export type Serializable = string | number | boolean | Date | null;

export abstract class Cache implements IDisposableAsync {

	abstract connect(): Promise<this>;
	abstract disconnect(): Promise<void>;
	abstract get(key: string): Promise<Serializable>;
	abstract has(key: string): Promise<boolean>;
	abstract set(key: string, value: Serializable, ttl?: number): Promise<void>;
	abstract unset(key: string): Promise<void>;
	abstract increment(key: string, amount?: number, ttl?: number): Promise<void>;
	abstract decrement(key: string, amount?: number, ttl?: number): Promise<void>;
	abstract expire(key: string, ttl: number): Promise<void>;
	abstract isDisposed(): boolean;
	abstract disposeAsync(): Promise<void>;

}