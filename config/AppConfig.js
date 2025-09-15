import dotenv from "dotenv";
dotenv.config();

const config = {
    shopify: {
        B2C_SHOPIFY_SHOPNAME: process.env.B2C_SHOPIFY_SHOPNAME,
        B2C_SHOPIFY_ACCESS_TOKEN: process.env.B2C_SHOPIFY_ACCESS_TOKEN,
        apiVersion: "2025-07",
        maxRetries: 5,
    },
    oblio: {
        baseURL: process.env.OBLIO_BASE_URL,
        OBLIO_EMAIL: process.env.OBLIO_EMAIL,
        OBLIO_API_TOKEN: process.env.OBLIO_API_TOKEN,
        OBLIO_COMPANY_CIF: process.env.OBLIO_COMPANY_CIF,
        OBLIO_INVOICE_SERIES: process.env.OBLIO_INVOICE_SERIES,
        OBLIO_MANAGEMENT: process.env.OBLIO_MANAGEMENT,
    },
    cargus: {
        baseURL: "https://urgentcargus.azure-api.net/api",
        trackingURL: "https://urgentcargus.ro/tracking-colet/",
        subscriptionKey: process.env.CARGUS_SUBSCRIPTION_KEY,
        username: process.env.CARGUS_USERNAME,
        password: process.env.CARGUS_PASSWORD,
        sender: {
            name: "PRIME SUPPLEMENTS",
            countyName: "Sibiu",
            localityName: "Sibiu",
            addressText: "Strada Cuptorului Nr. 10",
            contactPerson: "PRIME SUPPLEMENTS",
            phoneNumber: "0747866049",
            postalCode: "550104",
            email: "contact@primesupplements.ro"
        }
    }
};

export default config;
