
const moment = require('moment');
const prompt = require('prompt');
const readline = require('readline');
const fs = require('fs');
const { api } = require('./api');
const { delay, log, displayCountdown } = require('./utils');

const confirmConfig = (config) => {
	const confirmPrompt = {
		name: 'confirmPrompt',
		message: 'Confirm configuration and start script? [y/n]',
		validator: /y[es]*|n[o]?/,
		warning: 'Confirm by [y]es or [n]o.',
	};

	console.log(`----------`);
	console.log(`Symbol:\t\t\t${config.symbol}`);
	console.log(`Quantity:\t\t${config.sellQuantity}`);
	console.log(`Starting Price:\t\t${config.startingPrice}`);
	console.log(`Min Selling Price:\t${config.minSellPrice}`);
	console.log(`Price Delta:\t\t${config.priceDelta * 100}%`);
	console.log(`Trading Start Time:\t${moment(config.tradingStartTime).format()}`);
	console.log(`----------\n`);

	return new Promise(function(resolve, reject) {
		prompt.get(confirmPrompt, (err, result) => {
			if (result.confirmPrompt != 'y' && result.confirmPrompt != 'yes') {
				process.exit();
			} else {
				// Add empty line as delimiter and resolve promise to continue
				console.log();
				resolve();
			}
		});
	});
}

const testApi = async (api) => {
	const testOrder = {
		symbol: "BTCUSDT",
		side: "SELL",
		type: "LIMIT",
		quantity: 1,
		price: 10000
	};

	process.stdout.write("Testing API keys: ");
	const response = await api.placeOrder(testOrder, true);	// send a test order to binance api endpoint

	if (response.success) {
		process.stdout.write("PASSED\n\n");
	} else {
		process.stdout.write("FAILED\n");
		process.stdout.write("Unable to send Test Order. Check your API keys and try again.\n");
		process.exit();
	}
}

(async function main(configFile) {

	// Configure prompt objecct
	prompt.start();
	prompt.message = ' > ';
	prompt.delimiter = '';

	// Load the config file
	let CONFIG = JSON.parse(fs.readFileSync(configFile, 'utf8'));

	// Confirm the config settings
	await confirmConfig(CONFIG);

	let state = {
		orderId: null,
		orderPrice: CONFIG.startingPrice,
		orderQuantity: CONFIG.sellQuantity
	};

	let binanceApi = api(CONFIG.apiKey, CONFIG.apiSecret);

	// Test API keys
	await testApi(binanceApi);

	let order = {
		symbol: CONFIG.symbol,
		side: "SELL",
		type: "LIMIT",
		quantity: state.orderQuantity,
		price: state.orderPrice.toFixed(8)
	};

	const placeStartingOrder = async (order) => {
		log("Placing initial order...");
		const orderResponse = await binanceApi.placeOrder(order);
		if (orderResponse.data.code) {
			log(`Error placing first order. Retrying...`);
			let promise = new Promise(function(resolve, reject) {
				setTimeout(function() {				
				  resolve(placeStartingOrder(order));
				},
				50);
			});
			return await promise;
		} else {
			return orderResponse.data.orderId;
		}
	};

	let msRemaining = CONFIG.tradingStartTime - moment().valueOf();

	// Display countdown to trade start
	log(`Waiting until trading start time: ${moment(CONFIG.tradingStartTime).format()}`);
	displayCountdown(CONFIG.tradingStartTime - 1000); // stop countdown at 1s before start time.

	setTimeout( async () => {
		// Clear countdown timer
		readline.clearLine(process.stdout, 0);
		readline.cursorTo(process.stdout, 0);

		state.orderId = await placeStartingOrder(order);

		while(state.orderQuantity > 2) {
			// get order book
			let response = await binanceApi.getOrderBook(CONFIG.symbol);

			let bestPrice = parseFloat(response.data.bidPrice);

			log(`Best bid: ${bestPrice}`);
			if ((bestPrice <= (state.orderPrice * (1 - CONFIG.priceDelta))) &&
				(bestPrice >= CONFIG.minSellPrice)) {
				log(`Updating price to ${bestPrice}.`);
				//cancel current order and move the price lower
				log(`Cancelling previous order...`);
				let cancelResponse = await binanceApi.cancelOrder(CONFIG.symbol, state.orderId);
				if (cancelResponse.data.code) {
					console.log(cancelResponse);
					throw `Unable to cancel order '${state.orderId}'. Order might have been filled. Error: ${cancelResponse.data.code}`;
				}
				let filledQuantity = parseFloat(cancelResponse.data.executedQty);
				state.orderId = null;
				state.orderQuantity = state.orderQuantity - filledQuantity;
				state.orderPrice = bestPrice * (1 - CONFIG.limitDepth);
				log("Placing new order...");
				let newOrder = await binanceApi.placeOrder(Object.assign(
					{},
					order,
					{
						quantity: Math.floor(state.orderQuantity),
						price: state.orderPrice.toFixed(8)
					}
				));
				state.orderId = newOrder.data.orderId;
			}
		}
	},
	Math.max(0, msRemaining - 100)); // start trying to place orders 0.1s before official trading start time

})(process.argv[2]);