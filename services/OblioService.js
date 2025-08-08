import axios from "axios";
import config from "../config/AppConfig.js";

export default class OblioService {
    constructor() {
        if (!config.oblio.OBLIO_EMAIL || !config.oblio.OBLIO_API_TOKEN) {
            throw new Error('OblioService requires clientId and clientSecret');
        }
        
        this.clientId = config.oblio.OBLIO_EMAIL;
        this.clientSecret = config.oblio.OBLIO_API_TOKEN;
        this.baseURL = config.oblio.baseURL || "https://www.oblio.eu/api";
        this.accessToken = null;
        this.tokenExpiry = null;
        
        this.api = axios.create({
            baseURL: this.baseURL,
            timeout: 30000
        });
        
        // Auto-authenticate requests
        this.api.interceptors.request.use(async (config) => {
            if (config.url !== '/authorize/token') {
                await this.ensureToken();
                config.headers.Authorization = `Bearer ${this.accessToken}`;
            }
            return config;
        });
        
        // Auto-retry on auth failure
        this.api.interceptors.response.use(
            response => response,
            async (error) => {
                if (error.response?.status === 401 && !error.config._retry) {
                    error.config._retry = true;
                    this.accessToken = null;
                    await this.ensureToken();
                    error.config.headers.Authorization = `Bearer ${this.accessToken}`;
                    return this.api(error.config);
                }
                return Promise.reject(error);
            }
        );
    }

    async ensureToken() {
        if (this.accessToken && Date.now() < this.tokenExpiry) return;
        
        const { data } = await axios.post(
            `${this.baseURL}/authorize/token`,
            new URLSearchParams({
                client_id: this.clientId,
                client_secret: this.clientSecret
            }),
            { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
        );
        
        this.accessToken = data.access_token;
        this.tokenExpiry = Date.now() + (15 * 60 * 1000); // 15 minutes
    }
    
    async request(method, endpoint, data = null, retries = 3) {
        const config = { method, url: endpoint };
        if (data) config[method === 'GET' ? 'params' : 'data'] = data;
        
        return this.requestWithRetry(config, retries);
    }
    
    async requestWithRetry(config, maxRetries, attempt = 1) {
        const baseDelay = 2000; // 2 seconds
        
        try {
            const response = await this.api(config);
            return response.data;
            
        } catch (error) {
            const isRetryable = this.isRetryableError(error);
            const status = error.response?.status;
            const respData = error.response?.data;
            
            if (isRetryable && attempt < maxRetries) {
                const delay = baseDelay * Math.pow(2, attempt - 1);
                
                console.warn(`⚠️ Oblio API unavailable (attempt ${attempt}/${maxRetries}). Retrying in ${delay}ms...`, {
                    endpoint: config.url,
                    method: config.method,
                    error: error.message,
                    status,
                    response: respData
                });
                
                await this.sleep(delay);
                return this.requestWithRetry(config, maxRetries, attempt + 1);
                
            } else {
                console.error('❌ Oblio API request failed permanently:', {
                    endpoint: config.url,
                    method: config.method,
                    attempt,
                    maxRetries,
                    error: error.message,
                    retryable: isRetryable,
                    status,
                    response: respData
                });
                
                throw error;
            }
        }
    }
    
    isRetryableError(error) {
        // Network/connection errors
        if (error.code === 'ECONNREFUSED' || error.code === 'ETIMEDOUT' || error.code === 'ENOTFOUND') {
            return true;
        }
        
        // HTTP 5xx server errors
        if (error.response?.status >= 500) {
            return true;
        }
        
        // Rate limiting (429)
        if (error.response?.status === 429) {
            return true;
        }
        
        // Authentication errors are handled by interceptors, don't retry here
        return false;
    }
    
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    // Nomenclature methods
    async getProducts(cif, options = {}) {
        return this.request('GET', '/nomenclature/products', { cif, ...options });
    }
    
    async getCompanies() {
        return this.request('GET', '/nomenclature/companies');
    }
    
    async getVatRates(cif) {
        return this.request('GET', '/nomenclature/vat_rates', { cif });
    }
    
    async getClients(cif, options = {}) {
        return this.request('GET', '/nomenclature/clients', { cif, ...options });
    }
    
    async getSeries(cif) {
        return this.request('GET', '/nomenclature/series', { cif });
    }
    
    // Management (Gestiuni)
    async getManagements(cif) {
        // If the endpoint differs in your account, the error logger will show details
        return this.request('GET', '/nomenclature/management', { cif });
    }

    // Document methods
    async createProforma(data) {
        return this.request('POST', '/docs/proforma', data);
    }
    
    async createInvoice(data) {
        return this.request('POST', '/docs/invoice', data);
    }
}

// Example usage (commented out for production)
// const oblioService = new OblioService('contact@fluxsales.ro', 'a6d37475587351495d5f962bb23396aeec1f678f');
// oblioService.getCompanies().then((res) => console.log(res));
