'use strict';

const pageResults = require('graph-results-pager');

// TODO: exchange will need to be replaced with new exchange subgraph once it's finished
const graphAPIEndpoints = {
	exchange: 'https://api.luaswap.org/subgraphs/name/phucngh/Luaswap'
};

module.exports = {
	pageResults,
	graphAPIEndpoints,
	weth: {
		price() {
			let weth_usdc_pair = "0x347f551eaba062167779c9c336aa681526857b81"
			return pageResults({
				api: graphAPIEndpoints.exchange,
				query: {
					entity: 'pairs',
					selection: {
						where: {
							id: `\\"${weth_usdc_pair}\\"`
						}
					},
					properties: [
						'token0Price'
					]
				}
			})
				.then(([{ token0Price }]) => (Number(token0Price)))
				.catch(err => console.error(err))
		}
	},

};
