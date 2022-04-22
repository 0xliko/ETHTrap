const meow = require('meow');
const meowHelp = require('cli-meow-help');

const flags = {
	trapAddress: {
		type: `string`,
		default: '',
		alias: `t`,
		desc: `a wallet address for trap`
	},
	backupAddress: {
		type: `string`,
		default: '',
		alias: `b`,
		desc: `a wallet address for backup`
	},
	debug: {
		type: `boolean`,
		default: false,
		alias: `d`,
		desc: `Print debug info`
	}
};

const commands = {
	help: { desc: `Print help info` }
};

const helpText = meowHelp({
	name: `Trap Ethereum Bot`,
	flags,
	commands
});

const options = {
	inferType: true,
	description: false,
	hardRejection: false,
	flags
};

module.exports = meow(helpText, options);
