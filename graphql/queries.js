/**
 * GraphQL queries for Shopify operations
 */

export const GET_ORDER_WITH_FULFILLMENT_ORDERS = `
    query GetOrderWithFulfillmentOrders($id: ID!) {
        order(id: $id) {
            id
            name
            email
            phone
            displayFulfillmentStatus
            fulfillable
            fulfillments(first: 10) {
                id
                status
                trackingInfo(first: 5) {
                    company
                    number
                    url
                }
            }
            lineItems(first: 50) {
                edges {
                    node {
                        id
                        name
                        quantity
                        unfulfilledQuantity
                        requiresShipping
                        fulfillmentStatus
                    }
                }
            }
            fulfillmentOrders(first: 10) {
                edges {
                    node {
                        id
                        status
                        requestStatus
                        supportedActions {
                            action
                        }
                        destination {
                            address1
                            address2
                            city
                            countryCode
                            email
                            firstName
                            lastName
                            phone
                            province
                            zip
                        }
                        lineItems(first: 50) {
                            edges {
                                node {
                                    id
                                    totalQuantity
                                    remainingQuantity
                                    lineItem {
                                        id
                                        name
                                        quantity
                                        sku
                                        variant {
                                            id
                                            title
                                        }
                                    }
                                }
                            }
                        }
                        assignedLocation {
                            name
                            location {
                                id
                                name
                            }
                        }
                    }
                }
            }
        }
    }
`;

export const FIND_UNFULFILLED_ORDERS = `
    query FindUnfulfilledOrders($first: Int!) {
        orders(first: $first, query: "fulfillment_status:unfulfilled") {
            edges {
                node {
                    id
                    name
                    displayFulfillmentStatus
                    fulfillable
                    createdAt
                    lineItems(first: 5) {
                        edges {
                            node {
                                name
                                quantity
                                unfulfilledQuantity
                                requiresShipping
                            }
                        }
                    }
                }
            }
        }
    }
`;

export const GET_ALL_PRODUCTS = `
    query GetAllProducts($first: Int!, $after: String, $query: String) {
        products(first: $first, after: $after, query: $query) {
            edges {
                cursor
                node {
                    id
                    title
                    handle
                    productType
                    vendor
                    status
                    totalInventory
                    tracksInventory
                    variants(first: 50) {
                        edges {
                            node {
                                id
                                title
                                sku
                                price
                                inventoryQuantity
                                inventoryItem {
                                    id
                                    tracked
                                    inventoryLevels(first: 3) {
                                        edges {
                                            node {
                                                quantities(names: ["available"]) {
                                                    name
                                                    quantity
                                                }
                                                location {
                                                    id
                                                    name
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
            pageInfo {
                hasNextPage
                endCursor
            }
        }
    }
`;