// Code generated by konstellio (@konstellio/cli@0.2.9). DO NOT EDIT.
// Please don't change this file manually but run `konstellio generate` to update it.
// For more information, please read the docs: https://konstell.io/docs/cli/

import { join } from 'path';
import { createServer } from '@konstellio/server';
import { Context } from './types.d';

export default function () {
	return createServer<Context>(join(__dirname, '../../../konstellio.yml'));
}
