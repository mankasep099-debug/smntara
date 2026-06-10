const axios = require('axios');

class RuangOTP {
    constructor(baseURL = 'https://api.ruangotp.site/api/v1') {
        this.baseURL = baseURL;
    }

    // Helper untuk request
    async request(method, endpoint, params = {}, headers = {}) {
        try {
            const config = {
                method,
                url: `${this.baseURL}${endpoint}`,
                headers: {
                    'x-user-id': headers['x-user-id'] || headers.xUserId,
                    'Content-Type': 'application/json',
                    ...headers
                }
            };

            if (method.toLowerCase() === 'get') {
                config.params = params;
            } else {
                config.data = params;
            }

            const response = await axios(config);
            return response.data;
        } catch (error) {
            return {
                success: false,
                message: error.response?.data?.message || error.message,
                error: error.response?.data || error.message
            };
        }
    }

    // 1. Daftar Layanan (Services List)
    async getServices(xUserId) {
        return this.request('GET', '/services/list', {}, { 'x-user-id': xUserId });
    }

    // 2. Daftar Negara (Countries List)
    async getCountries(xUserId, serviceId) {
        return this.request('GET', '/countries/list', { service_id: serviceId }, { 'x-user-id': xUserId });
    }

    // 3. Daftar Operator (Operators List)
    async getOperators(xUserId, country, providerId) {
        const params = { country };
        if (providerId) params.provider_id = providerId;
        return this.request('GET', '/operators/list', params, { 'x-user-id': xUserId });
    }

    // 4. Order Nomor (Buy Number)
    async orderNumber(xUserId, numberId, providerId, operatorId = 'any', expectedPrice = null) {
        const params = {
            number_id: numberId,
            provider_id: providerId,
            operator_id: operatorId
        };
        if (expectedPrice) params.expected_price = expectedPrice;

        return this.request('GET', '/orders/buy', params, { 'x-user-id': xUserId });
    }

    // 5. Cek Status SMS (Check Order Status)
    async checkStatus(xUserId, orderId) {
        return this.request('GET', '/orders/check-status', { order_id: orderId }, { 'x-user-id': xUserId });
    }

    // 6. Cancel Order
    async cancelOrder(xUserId, orderId) {
        return this.request('GET', '/orders/cancel', { order_id: orderId }, { 'x-user-id': xUserId });
    }
}

module.exports = RuangOTP;
