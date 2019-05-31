const crypto = require('crypto');
const request = require('request');
const moment = require('moment');
const { delay } = require('./utils');

const API_ENDPOINTS = {
    'GET_ORDER_BOOK': 'https://api.binance.com/api/v3/ticker/bookTicker',
    'PLACE_ORDER': 'https://api.binance.com/api/v3/order',
    'CANCEL_ORDER': 'https://api.binance.com/api/v3/order',
    'TEST_ORDER': 'https://api.binance.com/api/v3/order/test'
};

const api = (key, secret) => {

    let apiSecret = secret;
    let apiKey = key;
    let requestDelay = 0;

    const sendRequest = async (options) => {
        if (requestDelay > 0 ) {
            await delay(requestDelay);
        }
        return new Promise((resolve, reject) => {
            request(options, (error, response, body) => {
                let success = (!error && response.statusCode == 200) ? true : false;

                if (response.statusCode == 429 || response.statusCode == 418) {
                    requestDelay = response.headers['Retry-After'] * 1000;
                } else {
                    requestDelay = 0;
                }

                resolve(
                    {
                        success: success,
                        httpCode: response.statusCode,
                        data: JSON.parse(body)
                    }
                );
            });
        });
    }

    return {
        /*
            order: {
                symbol: String,
                side: String,
                type: String,
                quantity: String,
                price: String
            }
        */
        placeOrder: async (order) => {
            const timestamp = moment().valueOf();
            let requestBody = `symbol=${order.symbol}&side=${order.side}&type=${order.type}&quantity=${order.quantity}&price=${order.price}&timeInForce=GTC&timestamp=${timestamp}`;          
            const sign = crypto.createHmac('sha256', apiSecret).update(requestBody).digest('hex');

            requestBody = `${requestBody}&signature=${sign}`;
            
            const options = {
                url: API_ENDPOINTS['PLACE_ORDER'],
                method: 'POST',
                headers: {
                    'X-MBX-APIKEY': apiKey
                },
                forever: true,
                form: requestBody
            };

            return await sendRequest(options);
        },

        getOrderBook: async (symbol) => {
            const options = {
                url: `${API_ENDPOINTS['GET_ORDER_BOOK']}?symbol=${symbol}`,
                method: 'GET',
                headers: {
                    'X-MBX-APIKEY': apiKey
                },
                forever: true
            };

            return await sendRequest(options);
        },

        cancelOrder: async (symbol, orderId) => {
            const timestamp = moment().valueOf();
            let requestBody = `symbol=${symbol}&orderId=${orderId}&timestamp=${timestamp}`;
            const sign = crypto.createHmac('sha256', apiSecret).update(requestBody).digest('hex');
            requestBody = `${requestBody}&signature=${sign}`;

            const options = {
                url: API_ENDPOINTS['CANCEL_ORDER'],
                method: 'DELETE',
                headers: {
                    'X-MBX-APIKEY': apiKey
                },
                forever: true,
                form: requestBody
            };
            //console.log(options);
            return await sendRequest(options);
        }
    };
};

module.exports = {
    api: api
};