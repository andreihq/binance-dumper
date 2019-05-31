
const moment = require('moment');
const fs = require('fs');
const { api } = require('./api');
const { delay, log } = require('./utils');

(async function main(configFile) {

	// Load the config file
	let CONFIG = JSON.parse(fs.readFileSync(configFile, 'utf8'));

	let state = {
		orderId: null,
		orderPrice: CONFIG.startingPrice,
		orderQuantity: CONFIG.sellQuantity,
		requestDelay: 0
	};

	let binanceApi = api(CONFIG.apiKey, CONFIG.apiSecret);

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
				100);
			});
			return await promise;
		} else {
			return orderResponse.data.orderId;
		}
	};


	let msRemaining = CONFIG.tradingStartTime - moment().valueOf();

	log(`Trading will start at ${moment(CONFIG.tradingStartTime).format()}`);

	setTimeout( async () => {

		state.orderId = await placeStartingOrder(order);

		while(state.orderQuantity > 2) {
			// get order book
			let response = await binanceApi.getOrderBook(CONFIG.symbol);

			let bestPrice = parseFloat(response.data.bidPrice);

			if (response.httpCode == 429) {
				log("Limiting request rate.");
				state.requestDelay = 100;
			} else {
				state.requestDelay = 0;
			}

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
				state.orderPrice = bestPrice;
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

			if (state.requestDelay) {
				await delay(state.requestDelay);
			}
		}
	},
	Math.max(0,msRemaining));

})(process.argv[2]);