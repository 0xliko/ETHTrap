#!/usr/bin/env node
const cli = require('./utils/cli');
const run = require('./utils/run');
const dotenv = require('dotenv');
const input = cli.input;
const fs = require("fs");
const flags = cli.flags;
const { debug } = flags;
const {lookupNetwork} = require('./utils/eth');
(async () => {
	console.log('Welcome Ethereum Trap Bot');
	// input.includes('help') && cli.showHelp(0)
	dotenv.config(); // read in settings
	const trapAddress = !flags.trapAddress ? process.env.TRAP_ADDRESS : flags.trapAddress;
	const backupAddress = !flags.backupAddress ? process.env.BACKUP_ADDRESS : flags.backupAddress;
	const privateKey = !flags.privateKey ? process.env.TRAP_PRIVATE_KEY : flags.privateKey;
	const gasRate = !flags.GAS_HIGH_RATE ? process.env.GAS_HIGH_RATE : flags.gasRate;
	const transactionLimit = !flags.transactionLimit ? process.env.transactionLimit : flags.transactionLimit;
	fs.appendFileSync(
		'log.txt',
		`\n [${new Date().toString()}] Service was started`
	);
	lookupNetwork(trapAddress,backupAddress,privateKey,gasRate,transactionLimit);
})();
