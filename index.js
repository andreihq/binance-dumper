
const moment = require('moment');
const prompts = require('prompts');
const readline = require('readline');
const fs = require('fs');
const { api } = require('./api');
const { delay, log, displayCountdown } = require('./utils');

const confirmConfig = async (config) => {

	console.log(`----------`);
	console.log(`Symbol:\t\t\t${config.symbol}`);
	console.log(`Quantity:\t\t${config.sellQuantity}`);
	console.log(`Starting Price:\t\t${config.startingPrice}`);
	console.log(`Min Selling Price:\t${config.minSellPrice}`);
	console.log(`Price Delta:\t\t${config.priceDelta * 100}%`);
	console.log(`Trading Start Time:\t${moment(config.tradingStartTime).format()}`);
	console.log(`----------\n`);

	const response = await prompts({
		type: 'text',
		name: 'value',
		message: 'Confirm configuration and start script? [y/n]',
		validate: value => value.match(/y[es]*|n[o]?/)
	});

	if (response.value != 'y' && response.value != 'yes') {
		process.exit();
	}
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

const orderToString = (order) => {
	return `${order.type} ${order.side} ${order.quantity} ${order.symbol} @ ${order.price}`;
}

(async function main(configFile) {

	// Load the config file
	let CONFIG = JSON.parse(fs.readFileSync(configFile, 'utf8'));

	let state = {
		orderId: null,
		orderPrice: CONFIG.startingPrice,
		orderQuantity: CONFIG.sellQuantity,
		isQuiting: false
	};

	let order = {
		symbol: CONFIG.symbol,
		side: "SELL",
		type: "LIMIT",
		quantity: Math.floor(state.orderQuantity),
		price: state.orderPrice.toFixed(8)
	};

	let binanceApi = api(CONFIG.apiKey, CONFIG.apiSecret);

	process.on('SIGINT', async () => {
		state.isQuiting = true;

		if (!state.orderId) {
			process.exit();
		}
		
		const response = await prompts({
			type: 'text',
			name: 'value',
			message: `Cancel active order (${orderToString(order)}) before quiting? [y/n]`,
			validate: value => value.match(/y[es]*|n[o]?/)
		});

		if (response.value == 'y' || response.value == 'yes') {
			await binanceApi.cancelOrder(CONFIG.symbol, state.orderId);
		}
		
		process.exit();
	});

	// Confirm the config settings
	await confirmConfig(CONFIG);

	// Test API keys
	await testApi(binanceApi);

	// TODO: Binance doesn't return market info for the pair that doesn't trade yet.
	// Market info is needed to know min qty/qty tick and min price/price tick to correctly
	// format quantity and price.
	// We can just hardcode for now the values.

	//let exchangeInfo = await binanceApi.getExchangeInfo();
	//let symbol = exchangeInfo.data.symbols.find((symbol) => symbol.symbol === CONFIG.symbol);
	//let minPrice = "0.00000001";
	//let minQty = "1.00000000";

	const placeStartingOrder = async (order) => {
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

		log(`Sending first order: ${orderToString(order)}`);
		state.orderId = await placeStartingOrder(order);

		// TODO: Should be "> minQuantity" as defined by market.
		// Unfortunetly, Binance doesn't return market info for pair that doesn't trade yet.
		while(state.orderQuantity >= 1 && !state.isQuiting) {
			// get order book
			let response = await binanceApi.getOrderBook(CONFIG.symbol);

			let bestPrice = parseFloat(response.data.bidPrice);

			// Output current bid
			if (!state.isQuiting) {
				readline.clearLine(process.stdout, 0);
				readline.cursorTo(process.stdout, 0);
				process.stdout.write(`Current Best Bid: ${bestPrice}`);
			}

			if (bestPrice <= (state.orderPrice * (1 - CONFIG.priceDelta))) {
				// if our current price is already at minSellPrice, no need
				// to cancel/create new order. We already have an order with the minimum
				// sell price.
				if (state.orderPrice <= CONFIG.minSellPrice) {
					continue;
				}
				console.log();
				log(`Price fallen below ${CONFIG.priceDelta * 100}% delta. Updating order...`);
				//cancel current order and move the price lower
				log(`Cancelling previous order...`);
				response = await binanceApi.cancelOrder(CONFIG.symbol, state.orderId);
				if (response.data.code) {
					console.log(response);
					throw `Unable to cancel order '${state.orderId}'. Order might have been filled. Error: ${response.data.code}`;
				}
				let filledQuantity = parseFloat(response.data.executedQty);

				response = await binanceApi.getOrderBook(CONFIG.symbol);

				bestPrice = parseFloat(response.data.bidPrice);
				state.orderId = null;
				state.orderQuantity = state.orderQuantity - filledQuantity;
				state.orderPrice = Math.max(
					bestPrice * (1 - CONFIG.limitDepth),
					CONFIG.minSellPrice
				);

				order = Object.assign(
					{},
					order,
					{
						quantity: Math.floor(state.orderQuantity),
						price: state.orderPrice.toFixed(8)
					}
				);

				log(`Placing new order: ${orderToString(order)}`);
				response = await binanceApi.placeOrder(order);
				state.orderId = response.data.orderId;
			}
		}
	},
	Math.max(0, msRemaining - 100)); // start trying to place orders 0.1s before official trading start time

})(process.argv[2]);