// Using Node.js 18+ built-in fetch

class RemineService {
    constructor() {
        this.apiKey = process.env.REMINE_API_KEY;
        this.baseUrl = process.env.REMINE_API_BASE_URL || 'https://api.remine.com/v1'; // Adjust based on actual API
        this.timeout = parseInt(process.env.REMINE_API_TIMEOUT) || 30000;
        this.cache = new Map();
        this.cacheTTL = parseInt(process.env.REMINE_CACHE_TTL) || 3600000; // 1 hour
    }

    /**
     * Make authenticated API request to REmine PRD API
     */
    async makeRequest(endpoint, params = {}) {
        const url = new URL(`${this.baseUrl}${endpoint}`);

        // Add query parameters
        Object.keys(params).forEach(key => {
            url.searchParams.append(key, params[key]);
        });

        const requestOptions = {
            method: 'GET',
            headers: {
                'X-API-Key': this.apiKey,
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            timeout: this.timeout
        };

        try {
            console.log(`Making REmine API request to: ${url.toString()}`);
            console.log('Request headers:', JSON.stringify(requestOptions.headers, null, 2));

            const response = await fetch(url.toString(), requestOptions);
            console.log(`REmine API response status: ${response.status}`);

            if (!response.ok) {
                const errorText = await response.text();
                console.error(`REmine API Error ${response.status}: ${errorText}`);
                throw new Error(`REmine API Error ${response.status}: ${errorText}`);
            }

            const data = await response.json();
            console.log('REmine API response data:', JSON.stringify(data, null, 2));
            return data;
        } catch (error) {
            console.error(`REmine API request failed for ${endpoint}:`, error);
            throw error;
        }
    }

    /**
     * Get cached data or fetch from API
     */
    async getCachedData(cacheKey, fetchFunction) {
        const cached = this.cache.get(cacheKey);
        if (cached && (Date.now() - cached.timestamp) < this.cacheTTL) {
            return cached.data;
        }

        try {
            const data = await fetchFunction();
            this.cache.set(cacheKey, {
                data,
                timestamp: Date.now()
            });
            return data;
        } catch (error) {
            // If cached data exists but is stale, return it as fallback
            if (cached) {
                console.warn(`Using stale cached data for ${cacheKey}:`, error.message);
                return cached.data;
            }
            throw error;
        }
    }

    /**
     * Resolve property key from address/city/state
     * Based on PRD: Keys documentation
     */
    async getPropertyKey(address) {
        // Try to parse address components
        let city, state, street;

        if (typeof address === 'string') {
            // Parse full address string
            const parsed = this.parseAddress(address);
            city = parsed.city;
            state = parsed.state;
            street = parsed.street;
        } else {
            city = address.city;
            state = address.state;
            street = address.street || address.address;
        }

        if (!city || !state) {
            throw new Error('City and state are required for property key resolution');
        }

        const cacheKey = `property_key_${city}_${state}_${street || 'general'}`;

        return this.getCachedData(cacheKey, async () => {
            // Based on working example from REmine rep
            const params = {
                city: city,
                state: state,
                zip: '', // Optional zip code
                line2: '' // Optional line2 (apartment/unit)
            };

            if (street) {
                params.line1 = street; // Street address as line1
            }

            // Use the correct PRD API endpoint
            const response = await this.makeRequest('/locations/search', params);

            if (!response || !response.properties || response.properties.length === 0) {
                throw new Error(`No properties found for ${city}, ${state}${street ? `, ${street}` : ''}`);
            }

            // Return the first (most relevant) property key
            return response.properties[0].property_key || response.properties[0].id;
        });
    }

    /**
     * Parse address string into components
     */
    parseAddress(addressString) {
        // Basic address parsing - may need enhancement based on actual address formats
        const parts = addressString.split(',').map(p => p.trim());

        let street, city, state;

        if (parts.length >= 2) {
            state = parts[parts.length - 1];
            city = parts[parts.length - 2];
            street = parts.slice(0, -2).join(', ');
        }

        return { street, city, state };
    }

    /**
     * Get building data for a property
     * Based on PRD: Building documentation
     */
    async getBuildingData(propertyKey) {
        const cacheKey = `building_${propertyKey}`;

        return this.getCachedData(cacheKey, async () => {
            const response = await this.makeRequest(`/buildings/${propertyKey}`);
            return this.extractBuildingData(response);
        });
    }

    /**
     * Extract relevant building data from API response
     */
    extractBuildingData(apiResponse) {
        // The API returns the full property object, extract building data from it
        const building = apiResponse.building || {};
        return {
            squareFootage: building.livingSqft || building.grossSqFt,
            bedrooms: building.numBedrooms,
            bathrooms: building.numFullBaths,
            yearBuilt: building.yearBuilt,
            propertyType: building.landUse,
            floodZone: building.floodZone?.floodZoneCategory,
            stories: building.numStories,
            garageSpaces: building.numGarageSpots,
            pool: building.pool,
            lastUpdated: new Date().toISOString()
        };
    }

    /**
     * Get tax data for a property
     * Based on PRD: Tax Data documentation
     */
    async getTaxData(propertyKey) {
        const cacheKey = `tax_${propertyKey}`;

        return this.getCachedData(cacheKey, async () => {
            const response = await this.makeRequest(`/taxes/${propertyKey}`);
            return this.extractTaxData(response);
        });
    }

    /**
     * Extract relevant tax data from API response
     */
    extractTaxData(apiResponse) {
        // Extract tax data from the property object
        const taxes = apiResponse.taxes || [];
        const latestTax = taxes.length > 0 ? taxes[0] : {};

        return {
            annualTaxes: latestTax.taxAmount,
            taxYear: latestTax.taxYear,
            assessedValue: latestTax.assessedValue,
            marketValue: apiResponse.building?.marketValue,
            exemptions: latestTax.exemptions || [],
            taxHistory: taxes.slice(0, 5), // Return last 5 years
            lastUpdated: new Date().toISOString()
        };
    }

    /**
     * Get mortgage data for a property
     * Based on PRD: Mortgages documentation
     */
    async getMortgageData(propertyKey) {
        const cacheKey = `mortgage_${propertyKey}`;

        return this.getCachedData(cacheKey, async () => {
            const response = await this.makeRequest(`/mortgages/${propertyKey}`);
            return this.extractMortgageData(response);
        });
    }

    /**
     * Extract relevant mortgage data from API response
     */
    extractMortgageData(apiResponse) {
        // Extract mortgage data from the property object
        const mortgages = apiResponse.mortgages || [];

        return mortgages.map(mortgage => ({
            loanAmount: mortgage.mortgageAmount,
            lender: mortgage.lenderName,
            loanType: mortgage.loanType,
            interestRate: mortgage.interestRate,
            originationDate: mortgage.recordingDate,
            maturityDate: mortgage.dueDate,
            currentBalance: mortgage.estimatedBalance || mortgage.mortgageAmount
        }));
    }

    /**
     * Search for comparable properties
     * Based on PRD: Methods and Keys documentation
     */
    async searchComparableProperties(city, state, propertyValue, propertyType) {
        const cacheKey = `comparables_${city}_${state}_${propertyValue}_${propertyType}`;

        return this.getCachedData(cacheKey, async () => {
            const params = {
                city: city,
                state: state,
                zip: '', // Optional zip code
                line1: '', // Empty street for general search
                line2: '' // Optional line2
                // Note: API may not support value filtering, will filter client-side
            };

            const response = await this.makeRequest('/locations/search', params);

            // The API returns an array directly, not an object with properties
            if (!response || !Array.isArray(response) || response.length === 0) {
                return [];
            }

            const properties = response; // The response is already the array of properties

            // Filter by property value range client-side since API may not support it
            const minValue = Math.max(0, propertyValue * 0.5); // More lenient: 50% of target
            const maxValue = propertyValue * 2.0; // More lenient: 200% of target

            let filteredProperties = properties;
            if (properties && properties.length > 0) {
                // For now, just take the first few properties to build insights
                // We'll refine filtering later once we understand the data structure
                filteredProperties = properties.slice(0, 5); // Take first 5 properties
            }

            // Limit to 10 results
            filteredProperties = filteredProperties.slice(0, 10);

            // Return basic property data for comparables
            return filteredProperties.map(prop => ({
                propertyKey: prop.remineId, // Use remineId as the property key
                address: prop.keys?.addressShort?.line1 || prop.keys?.addressCombined,
                city: prop.keys?.addressFull?.cityName,
                state: prop.keys?.addressFull?.state,
                value: prop.building?.marketValue || prop.valuation?.['Black Knight']?.currentValue,
                squareFootage: prop.building?.livingSqft,
                bedrooms: prop.building?.numBedrooms,
                bathrooms: prop.building?.numFullBaths,
                yearBuilt: prop.building?.yearBuilt,
                propertyType: prop.building?.landUse
            }));
        });
    }

    /**
     * Get comprehensive property insights for location
     */
    async getPropertyInsights(city, state, propertyValue, propertyType) {
        try {
            // Get comparable properties
            const comparables = await this.searchComparableProperties(city, state, propertyValue, propertyType);

            if (comparables.length === 0) {
                return {
                    location: { city, state },
                    comparables: [],
                    insights: {
                        averageValue: null,
                        averageTaxes: null,
                        floodZoneRisk: 'unknown',
                        message: `No comparable properties found in ${city}, ${state}`
                    }
                };
            }

            // Get detailed data for top 3 comparables
            const detailedProperties = [];
            for (let i = 0; i < Math.min(3, comparables.length); i++) {
                const prop = comparables[i];
                try {
                    const [buildingData, taxData, mortgageData] = await Promise.all([
                        this.getBuildingData(prop.propertyKey),
                        this.getTaxData(prop.propertyKey),
                        this.getMortgageData(prop.propertyKey)
                    ]);

                    detailedProperties.push({
                        ...prop,
                        building: buildingData,
                        tax: taxData,
                        mortgages: mortgageData
                    });
                } catch (error) {
                    console.warn(`Failed to get details for property ${prop.propertyKey}:`, error.message);
                    detailedProperties.push(prop); // Include basic data even if detailed fetch fails
                }
            }

            // Calculate insights
            const insights = this.calculateInsights(detailedProperties);

            return {
                location: { city, state },
                comparables: detailedProperties,
                insights: insights
            };

        } catch (error) {
            console.error('Failed to get property insights:', error);
            throw error;
        }
    }

    /**
     * Get transaction/sales data for a location
     */
    async getTransactionsForLocation(city, state, limit = 10) {
        const cacheKey = `transactions_${city}_${state}_${limit}`;

        return this.getCachedData(cacheKey, async () => {
            const params = {
                city: city,
                state: state,
                zip: '', // Optional zip code
                line1: '', // Empty street for general search
                line2: '' // Optional line2
            };

            const response = await this.makeRequest('/locations/search', params);

            if (!response || !Array.isArray(response) || response.length === 0) {
                return [];
            }

            // Extract and format transaction data from properties
            const transactions = [];
            for (const property of response.slice(0, limit * 2)) { // Get more to filter
                if (property.transactions && property.transactions.length > 0) {
                    for (const transaction of property.transactions) {
                        if (transaction.saleAmount && transaction.saleDate) {
                            transactions.push({
                                propertyAddress: property.keys?.addressShort?.line1 || 'Unknown Address',
                                salePrice: transaction.saleAmount,
                                saleDate: transaction.saleDate,
                                propertyType: property.building?.landUse || 'Unknown',
                                squareFootage: property.building?.livingSqft,
                                bedrooms: property.building?.numBedrooms,
                                bathrooms: property.building?.numFullBaths,
                                yearBuilt: property.building?.yearBuilt
                            });
                        }
                    }
                }
            }

            // Sort by sale date (most recent first) and limit results
            transactions.sort((a, b) => new Date(b.saleDate) - new Date(a.saleDate));
            return transactions.slice(0, limit);
        });
    }

    /**
     * Get rent estimates for a location (based on comparable property analysis)
     */
    async getRentEstimatesForLocation(city, state, limit = 10) {
        const cacheKey = `rent_estimates_${city}_${state}_${limit}`;

        return this.getCachedData(cacheKey, async () => {
            // Get properties and estimate rents based on market data
            // This is a simplified approach - in reality, rent data would come from MLS or rental platforms
            const properties = await this.searchComparableProperties(city, state, 500000, null);

            const rentEstimates = [];
            for (const property of properties.slice(0, limit)) {
                // Estimate rent as roughly 0.6-0.8% of property value per month
                // This is a very basic estimation - real rent data would need MLS integration
                const estimatedValue = property.value || property.building?.marketValue;
                if (estimatedValue) {
                    const monthlyRent = Math.round(estimatedValue * 0.007); // ~0.7% of value
                    const annualRent = monthlyRent * 12;

                    rentEstimates.push({
                        propertyAddress: property.address,
                        estimatedMonthlyRent: monthlyRent,
                        estimatedAnnualRent: annualRent,
                        propertyType: property.propertyType,
                        squareFootage: property.squareFootage,
                        bedrooms: property.bedrooms,
                        bathrooms: property.bathrooms,
                        yearBuilt: property.yearBuilt,
                        note: "Estimate based on property value and local market data"
                    });
                }
            }

            return rentEstimates;
        });
    }

    /**
     * Calculate insights from property data
     */
    calculateInsights(properties) {
        const insights = {
            averageValue: null,
            averageTaxes: null,
            floodZoneRisk: 'low',
            propertyTypes: new Set(),
            averageSquareFootage: null,
            averageYearBuilt: null
        };

        const validProperties = properties.filter(p => p.value);

        if (validProperties.length > 0) {
            insights.averageValue = validProperties.reduce((sum, p) => sum + p.value, 0) / validProperties.length;
        }

        // Calculate tax insights
        const propertiesWithTaxes = properties.filter(p => p.tax && p.tax.annualTaxes);
        if (propertiesWithTaxes.length > 0) {
            insights.averageTaxes = propertiesWithTaxes.reduce((sum, p) => sum + p.tax.annualTaxes, 0) / propertiesWithTaxes.length;
        }

        // Check flood zones
        const floodZones = properties
            .filter(p => p.building && p.building.floodZone)
            .map(p => p.building.floodZone);

        if (floodZones.some(zone => zone.includes('A') || zone.includes('V'))) {
            insights.floodZoneRisk = 'high';
        } else if (floodZones.some(zone => zone.includes('B') || zone.includes('X'))) {
            insights.floodZoneRisk = 'medium';
        }

        // Property type distribution
        properties.forEach(p => {
            if (p.propertyType) insights.propertyTypes.add(p.propertyType);
        });
        insights.propertyTypes = Array.from(insights.propertyTypes);

        // Calculate averages for other metrics
        const propertiesWithSqft = properties.filter(p => p.squareFootage);
        if (propertiesWithSqft.length > 0) {
            insights.averageSquareFootage = propertiesWithSqft.reduce((sum, p) => sum + p.squareFootage, 0) / propertiesWithSqft.length;
        }

        const propertiesWithYear = properties.filter(p => p.yearBuilt);
        if (propertiesWithYear.length > 0) {
            insights.averageYearBuilt = Math.round(propertiesWithYear.reduce((sum, p) => sum + p.yearBuilt, 0) / propertiesWithYear.length);
        }

        return insights;
    }
}

module.exports = RemineService;
