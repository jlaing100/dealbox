// Real Estate Lender Matching Platform
class LenderMatchingApp {
    constructor() {
        this.lenderService = new LenderService();
        this.llmService = new OpenAIMatchingService();
        this.chatService = new ChatService();
        this.currentMatches = null; // Store current lender matches for chat context

        // Field label mappings for user-friendly display
        this.fieldLabels = {
            propertyValue: 'Property Value',
            propertyType: 'Property Type',
            creditScore: 'Credit Score',
            downPaymentPercent: 'Down Payment Percentage',
            investmentExperience: 'Investment Experience'
        };

        this.init();
    }
    
    async init() {
        this.bindEvents();
        this.animateEntrance();

        // Initialize services
        try {
            await this.lenderService.loadLenderDatabase();
            console.log('✅ All services initialized successfully');
        } catch (error) {
            console.error('Error initializing services:', error);
        }
    }
    
    bindEvents() {
        // Form submission
        const investorForm = document.getElementById('investor-form');
        const findLendersBtn = document.getElementById('find-lenders-btn');

        investorForm.addEventListener('submit', (e) => {
            e.preventDefault();
            this.handleFormSubmission();
        });

        // Real-time form validation
        const formInputs = investorForm.querySelectorAll('input, select, textarea');
        formInputs.forEach(input => {
            input.addEventListener('blur', () => this.validateField(input));
        });

        // Chat functionality
        this.bindChatEvents();

        // Deals button
        const dealsBtn = document.getElementById('deals-btn');
        if (dealsBtn) {
            dealsBtn.addEventListener('click', () => {
                this.handleHelpFieldSubmission();
            });
        }

        // Help field input
        const helpField = document.getElementById('help-field');
        if (helpField) {
            helpField.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    this.handleHelpFieldSubmission();
                }
            });
        }

        // Expert contact button
        const callExpertBtn = document.getElementById('call-expert-btn');
        if (callExpertBtn) {
            callExpertBtn.addEventListener('click', () => {
                this.callHumanExpert();
            });
        }
    }

    bindChatEvents() {
        const chatInput = document.getElementById('chat-input');
        const sendBtn = document.getElementById('send-btn');

        // Send message on Enter key
        chatInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                this.handleChatSend();
            }
        });

        // Send message on button click
        sendBtn.addEventListener('click', () => {
            this.handleChatSend();
        });

        // Auto-resize textarea
        chatInput.addEventListener('input', () => {
            chatInput.style.height = 'auto';
            chatInput.style.height = Math.min(chatInput.scrollHeight, 120) + 'px';
        });
    }

    async handleChatSend() {
        const chatInput = document.getElementById('chat-input');
        const sendBtn = document.getElementById('send-btn');
        const message = chatInput.value.trim();

        if (!message || this.chatService.isTyping) return;

        try {
            // Disable input while sending
            chatInput.disabled = true;
            sendBtn.disabled = true;

            // Send message
            await this.chatService.sendMessage(message);

            // Clear input
            chatInput.value = '';
            chatInput.style.height = 'auto';

        } catch (error) {
            console.error('Failed to send chat message:', error);
        } finally {
            // Re-enable input
            chatInput.disabled = false;
            sendBtn.disabled = false;
            chatInput.focus();
        }
    }
    
    formatFieldLabel(fieldKey = '') {
        if (!fieldKey) return 'Field';
        if (this.fieldLabels[fieldKey]) return this.fieldLabels[fieldKey];
        // Convert camelCase or snake_case to title case
        return fieldKey
            .replace(/([A-Z])/g, ' $1')
            .replace(/[_-]/g, ' ')
            .replace(/\s+/g, ' ')
            .trim()
            .replace(/\w\S*/g, word => word.charAt(0).toUpperCase() + word.slice(1));
    }

    animateEntrance() {
        // Animate landing page entrance
        setTimeout(() => {
            document.querySelector('.landing-page').classList.add('active');
        }, 300);
    }
    
    validateField(input) {
        const value = input.value.trim();
        let isValid = true;

        // Remove previous error styling
        input.classList.remove('error');

        // Basic validation rules
        if (input.type === 'number') {
            const numValue = parseFloat(value);
            if (value && (isNaN(numValue) || numValue < 0)) {
                isValid = false;
            }

            // Specific validation for different fields
            if (input.id === 'credit-score' && value && (numValue < 300 || numValue > 850)) {
                isValid = false;
            }

            if (input.id === 'current-rent' && value && numValue < 0) {
                isValid = false;
            }

        }

        if (!isValid) {
            input.classList.add('error');
        input.style.borderColor = '#ef4444';
        input.style.boxShadow = '0 0 15px rgba(239, 68, 68, 0.5)';
        } else {
            input.style.borderColor = '';
            input.style.boxShadow = '';
        }

        return isValid;
    }

    async handleFormSubmission() {
        const form = document.getElementById('investor-form');
        const submitBtn = document.getElementById('find-lenders-btn');

        // Validate all fields
        const formInputs = form.querySelectorAll('input, select, textarea');
        let allValid = true;

        formInputs.forEach(input => {
            if (!this.validateField(input)) {
                allValid = false;
            }
        });

        if (!allValid) {
            this.showFormError('Please check your input values and try again.');
            return;
        }

        // Collect form data
        const formData = this.collectFormData();

        // Store form data for chat context
        this.chatService.sessionState.formData = formData;
        this.chatService.sessionState.formDataTimestamp = new Date().toISOString();

        // Show loading state
        submitBtn.disabled = true;
        submitBtn.textContent = 'Analyzing...';
        this.showLoadingScreen();

        try {
            // Get property insights from REmine API
            let propertyInsights = null;
            try {
                if (formData.propertyLocation) {
                    // Parse city and state from location
                    const locationParts = formData.propertyLocation.split(',').map(p => p.trim());
                    if (locationParts.length >= 2) {
                        const city = locationParts[0];
                        const state = locationParts[1];

                        propertyInsights = await this.fetchPropertyInsights(city, state, formData.propertyValue, formData.propertyType);
                        console.log('Property insights loaded:', propertyInsights);
                    }
                }
            } catch (error) {
                console.warn('Failed to load property insights:', error);
                // Continue without property insights if API fails
            }

            // Store property insights for chat context
            this.propertyInsights = propertyInsights;

            // Find matching lenders with property insights
            const result = await this.findMatchingLenders(formData, propertyInsights);

            // Check if more info is required
            const requiresMoreInfo = result.requiresMoreInfo || false;
            const matches = result.matches || [];

            // Update results with actual lender matches
            this.displayResults(matches, requiresMoreInfo);

            if (requiresMoreInfo) {
                // Send message asking for missing information
                setTimeout(async () => {
                    try {
                        const missingFields = result.missingFields || [];
                        const missingFieldNames = missingFields.map(field => this.formatFieldLabel(field)).join(', ');
                        const missingInfoMessage = `I can see you've provided some information about your property deal. To give you the most accurate lender recommendations, I still need: ${missingFieldNames}.

Could you please provide ${missingFields.length === 1 ? 'that information' : 'these details'}?`;
                        const userContext = {
                            formData: formData,
                            lenderMatches: [],
                            sessionState: this.chatService.sessionState,
                            timestamp: new Date().toISOString()
                        };
                        await this.chatService.sendMessage(missingInfoMessage, userContext);
                    } catch (error) {
                        console.warn('Failed to send missing info request to chat:', error);
                    }
                }, 100);
            } else if (matches && matches.length > 0) {
                // Send follow-up message with lender recommendations
                // First send initial deal analysis
                setTimeout(async () => {
                    try {
                        const analysisMessage = this.generateDealAnalysisMessage(formData);
                        const userContext = {
                            formData: formData,
                            lenderMatches: [], // No matches yet, still analyzing
                            sessionState: this.chatService.sessionState,
                            timestamp: new Date().toISOString()
                        };
                        await this.chatService.sendMessage(analysisMessage, userContext);
                    } catch (error) {
                        console.warn('Failed to send initial deal analysis message:', error);
                    }
                }, 100);

                // Then send lender recommendations
                setTimeout(async () => {
                    try {
                        const recommendationsMessage = this.generateRecommendationsMessage(matches, formData);
                        const userContext = {
                            formData: formData,
                            lenderMatches: matches,
                            sessionState: this.chatService.sessionState,
                            timestamp: new Date().toISOString(),
                            isHypothetical: parameterChanges.isHypothetical || false,
                            hypotheticalChanges: parameterChanges.isHypothetical ? parameterChanges : null
                        };
                        await this.chatService.sendMessage(recommendationsMessage, userContext, propertyInsights);
                    } catch (error) {
                        console.warn('Failed to send lender recommendations to chat:', error);
                    }
                }, 500);
            }

            // If help field has content, send it as additional chat message
            if (formData.helpQuery && !requiresMoreInfo) {
                // Add a small delay to let the results display first
                setTimeout(async () => {
                    try {
                        await this.chatService.sendMessage(formData.helpQuery, formData, propertyInsights);
                    } catch (error) {
                        console.warn('Failed to send help query to chat:', error);
                    }
                }, 1000);
            }

        } catch (error) {
            console.error('Error finding matches:', error);
            this.showFormError('An error occurred while processing your request. Please try again.');
        } finally {
            // Reset button state
            submitBtn.disabled = false;
            submitBtn.innerHTML = `
                <span>Find Matching Lenders</span>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M5 12h14M12 5l7 7-7 7"/>
                </svg>
            `;
            this.hideLoadingScreen();
        }
    }

    async handleHelpFieldSubmission() {
        const helpField = document.getElementById('help-field');
        const helpText = helpField.value.trim();

        if (!helpText) {
            this.showFormError('Please describe how I can help you with your real estate deal.');
            return;
        }

        // Show loading state
        this.showLoadingScreen();

        try {
            // Store the help field input in session state for context
            this.chatService.sessionState.helpFieldInput = helpText;
            this.chatService.sessionState.helpFieldTimestamp = new Date().toISOString();

            // Always transition to Q&A layout first (Deal Analysis page)
            this.displayResults([], true);

            // Wait a bit for the layout transition to complete before sending message
            await new Promise(resolve => setTimeout(resolve, 100));

            // Send the help text to the chatbot for processing
            // The chatbot will handle parameter extraction, form updates, and lender matching
            await this.chatService.sendMessage(helpText);

            // Clear the help field after processing
            helpField.value = '';

        } catch (error) {
            console.error('Error processing help field:', error);
            this.showFormError('An error occurred while processing your request. Please try again.');
        } finally {
            this.hideLoadingScreen();
        }
    }

    generateDealAnalysisMessage(formData) {
        const parts = [];

        // Build summary of user's deal parameters
        parts.push("Based on your submitted deal information:");

        if (formData.propertyValue) {
            parts.push(`• Property Value: $${formData.propertyValue.toLocaleString()}`);
        }

        if (formData.propertyType) {
            parts.push(`• Property Type: ${formData.propertyType.replace('_', ' ')}`);
        }

        if (formData.propertyLocation) {
            parts.push(`• Location: ${formData.propertyLocation}`);
        }

        if (formData.downPaymentPercent !== null) {
            parts.push(`• Down Payment: ${formData.downPaymentPercent}%`);
        }

        if (formData.propertyVacant !== null) {
            parts.push(`• Property Vacant: ${formData.propertyVacant === 'yes' ? 'Yes' : 'No'}`);
        }

        if (formData.currentRent) {
            parts.push(`• Current Rent: $${formData.currentRent.toLocaleString()}/month`);
        }

        if (formData.creditScore) {
            parts.push(`• Credit Score: ${formData.creditScore}`);
        }

        if (formData.investmentExperience) {
            parts.push(`• Investment Experience: ${formData.investmentExperience.replace('_', ' ')}`);
        }

        parts.push("");
        parts.push("I'm analyzing your deal against our comprehensive lender database to find the best matching lenders for your situation. This may take a moment as I review the latest rates, terms, and requirements from multiple lenders.");

        return parts.join('\n');
    }

    generateRecommendationsMessage(matches, formData) {
        const parts = [];

        parts.push("## Lender Recommendations");
        parts.push("");
        parts.push(`I've analyzed your deal parameters against our comprehensive lender database and found ${matches.length} matching lenders based on the data you provided. Here are the top recommendations:`);
        parts.push("");

        // Show top 3 matches with key details
        const topMatches = matches.slice(0, 3);
        topMatches.forEach((match, index) => {
            const confidencePercent = Math.round(match.confidence * 100);
            parts.push(`**${index + 1}. ${match.lenderName} - ${match.programName}**`);
            parts.push(`• Match Confidence: ${confidencePercent}%`);
            parts.push(`• Why this matches: ${match.reason}`);

            if (match.maxLTV) {
                parts.push(`• Maximum LTV: ${match.maxLTV}%`);
            }
            if (match.minCreditScore) {
                parts.push(`• Minimum Credit Score: ${match.minCreditScore}`);
            }
            if (match.maxLoanAmount) {
                parts.push(`• Maximum Loan Amount: $${match.maxLoanAmount.toLocaleString()}`);
            }
            if (match.website) {
                parts.push(`• Website: ${match.website}`);
            }
            parts.push("");
        });

        if (matches.length > 3) {
            const remaining = matches.length - 3;
            parts.push(`Plus ${remaining} additional lenders that may be suitable for your deal.`);
            parts.push("");
        }

        parts.push("These recommendations are based on the lender data in our database, including credit requirements, loan-to-value ratios, property types supported, and loan amount limits. Each lender's programs have different eligibility criteria, so I recommend reviewing the specific details and contacting them directly for the most current rates and terms.");
        parts.push("");
        parts.push("Would you like me to explain any of these recommendations in more detail, or help you compare specific lenders?");

        return parts.join('\n');
    }

    collectFormData() {
        const downPaymentValue = document.getElementById('down-payment-percent').value;
        let downPaymentPercent = null;

        // Convert dropdown values to numeric percentages
        if (downPaymentValue === 'under_15') downPaymentPercent = 10;
        else if (downPaymentValue === '15') downPaymentPercent = 15;
        else if (downPaymentValue === '20') downPaymentPercent = 20;
        else if (downPaymentValue === '25') downPaymentPercent = 25;
        else if (downPaymentValue === '30_plus') downPaymentPercent = 30;

        // Get property type value, filtering out placeholder
        const propertyTypeValue = document.getElementById('property-type').value;
        const propertyType = (propertyTypeValue && propertyTypeValue !== 'Select type...') ? propertyTypeValue : null;

        return {
            propertyValue: parseFloat(document.getElementById('property-value').value) || null,
            propertyType: propertyType,
            propertyLocation: document.getElementById('property-location').value.trim() || null,
            downPaymentPercent: downPaymentPercent,
            propertyVacant: document.getElementById('property-vacant').value || null,
            currentRent: parseFloat(document.getElementById('current-rent').value) || null,
            creditScore: parseInt(document.getElementById('credit-score').value) || null,
            investmentExperience: document.getElementById('investment-experience').value || null,
            helpQuery: document.getElementById('help-field').value.trim() || null,
        };
    }
    
    validateRequiredFields(formData) {
        const requiredFields = {
            'propertyValue': 'Property Value',
            'propertyType': 'Property Type',
            'creditScore': 'Credit Score',
            'downPaymentPercent': 'Down Payment Percentage',
            'investmentExperience': 'Investment Experience'
        };

        const missingFields = [];

        for (const [field, label] of Object.entries(requiredFields)) {
            if (!formData[field] || formData[field] === 'Select type...' || formData[field] === 'Select percentage...') {
                missingFields.push(label);
            }
        }

        if (missingFields.length > 0) {
            return {
                isValid: false,
                message: `Please provide the following required information: ${missingFields.join(', ')}`
            };
        }

        return { isValid: true };
    }

    async findMatchingLenders(buyerProfile, propertyInsights = null) {
        try {
            // Use OpenAI service to analyze and match with property insights
            const result = await this.llmService.findLenderMatches(buyerProfile, propertyInsights);
            return result;
        } catch (error) {
            console.error('OpenAI matching failed:', error);

            // Fallback to rule-based matching - return matches array wrapped in response object
            console.log('Falling back to rule-based matching...');
            const matches = this.lenderService.findMatchesByRules(buyerProfile);
            return {
                matches: matches,
                requiresMoreInfo: false
            };
        }
    }

    async fetchPropertyInsights(city, state, propertyValue, propertyType = null) {
        try {
            const response = await fetch(getApiBaseUrl() + '/api/remine/property-insights', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    city,
                    state,
                    propertyValue: parseFloat(propertyValue),
                    propertyType
                })
            });

            if (!response.ok) {
                throw new Error(`REmine API error: ${response.status}`);
            }

            const data = await response.json();
            return data.insights; // Return just the insights object
        } catch (error) {
            console.error('Error fetching property insights:', error);

            // Show user-friendly error message
            if (error.message.includes('timeout') || error.message.includes('fetch')) {
                console.warn('Property insights service is temporarily unavailable, continuing without insights');
                return null; // Return null instead of throwing to allow form submission to continue
            }

            throw error;
        }
    }

    resetChatForNewSearch() {
        // Clear chat messages container
        const chatMessages = document.getElementById('chat-messages');
        if (chatMessages) {
            chatMessages.innerHTML = '';
        }

        // Clear conversation history in ChatService - ONLY for completely new searches
        // NOT when transitioning to Q&A from landing page
        this.chatService.clearHistory();

        // Enable chat input
        const chatInput = document.getElementById('chat-input');
        if (chatInput) {
            chatInput.disabled = false;
            chatInput.focus();
        }
    }

    displayResults(matches, requiresMoreInfo = false) {
        // Store matches for chat context
        this.currentMatches = matches;

        // Only reset chat if this is the first time showing results (transitioning from landing page)
        const qaLayout = document.getElementById('qa-layout');
        const isFirstDisplay = !qaLayout.classList.contains('active');
        
        if (isFirstDisplay) {
            this.resetChatForNewSearch();
        }

        // Transition from landing page to results view
        const landingPage = document.getElementById('landing-page');

        // Scroll to top for better UX
        window.scrollTo({ top: 0, behavior: 'smooth' });

        // Hide landing page
        landingPage.classList.remove('active');
        setTimeout(() => {
            landingPage.style.display = 'none';
        }, 300);

        // Show results layout
        qaLayout.style.display = 'grid';
        setTimeout(() => {
            qaLayout.classList.add('active');
        }, 50);

        // Update status indicator
        const statusIndicator = document.querySelector('.status-indicator span');
        const statusDot = document.querySelector('.status-dot');

        if (requiresMoreInfo) {
            statusIndicator.textContent = 'More information needed';
            statusDot.style.background = '#f59e0b';
        } else if (matches && matches.length > 0) {
            statusIndicator.textContent = `${matches.length} lenders found`;
            statusDot.style.background = '#10b981';
        } else {
            statusIndicator.textContent = 'No matches found';
            statusDot.style.background = '#f59e0b';
        }

        // Show solution cards
        setTimeout(() => {
            if (requiresMoreInfo) {
                this.showIncompleteInfoCard();
            } else {
                this.showLenderCards(matches);
            }
        }, 500);

        // Add initial chat suggestions after results are shown (only on first display)
        if (isFirstDisplay) {
            setTimeout(() => {
                this.addInitialChatSuggestions(matches, requiresMoreInfo);
            }, 1000);
        }
    }

    addInitialChatSuggestions(matches, requiresMoreInfo = false) {
        let welcomeMessage;

        if (requiresMoreInfo) {
            // Get current form data to provide context about what was provided
            const formData = this.collectFormData();
            const providedInfo = [];

            if (formData.propertyValue) providedInfo.push(`property value of $${formData.propertyValue.toLocaleString()}`);
            if (formData.propertyType) providedInfo.push(`property type: ${formData.propertyType}`);
            if (formData.propertyLocation) providedInfo.push(`location: ${formData.propertyLocation}`);
            if (formData.downPaymentPercent) providedInfo.push(`down payment: ${formData.downPaymentPercent}%`);
            if (formData.propertyVacant !== null) providedInfo.push(`property vacancy: ${formData.propertyVacant ? 'Yes' : 'No'}`);
            if (formData.currentRent) providedInfo.push(`current rent: $${formData.currentRent.toLocaleString()}/month`);
            if (formData.creditScore) providedInfo.push(`credit score: ${formData.creditScore}`);
            if (formData.investmentExperience) providedInfo.push(`investment experience: ${formData.investmentExperience}`);

            let contextMessage = '';
            if (providedInfo.length > 0) {
                contextMessage = `I can see you've provided ${providedInfo.join(', ')}. `;
            }

            welcomeMessage = `${contextMessage}To provide personalized lender recommendations, I need a few more details: property value, property type, location, credit score, and down payment percentage. Please share the missing information with me so I can help you find the best lenders for your situation.`;
        } else if (matches && matches.length > 0) {
            welcomeMessage = `I've analyzed your profile and found ${matches.length} lenders to evaluate for your deal. I can help you understand these options better, compare programs, or answer questions about the lending process. What would you like to know?`;
        } else {
            welcomeMessage = `I've analyzed your profile but couldn't find matching lenders. Let me know if you'd like to provide additional details or explore alternative lending options.`;
        }

        setTimeout(() => {
            this.chatService.displayMessage(welcomeMessage, 'bot');
        }, 500);
    }

    askAboutLender(lenderName, programName) {
        const question = `Give me a brief 2-3 sentence summary of ${lenderName} and their ${programName} program, focusing on key benefits and requirements.`;
        this.chatService.sendMessage(question);
    }

    callHumanExpert() {
        // Open phone dialer with placeholder number - replace with actual number
        const phoneNumber = '+1-555-123-4567'; // Replace with actual phone number
        window.open(`tel:${phoneNumber}`, '_self');
    }
    
    showLenderCards(matches, isHypothetical = false, hypotheticalChanges = null) {
        const solutionCards = document.getElementById('solution-cards');
        const solutionsCount = document.getElementById('solutions-count');

        // Clear existing cards
        solutionCards.innerHTML = '';

        // Update count with hypothetical indicator
        const matchCount = matches ? matches.filter(m => m.isMatch).length : 0;
        const totalCount = matches ? matches.length : 0;
        let countText;

        if (totalCount === 0) {
            countText = 'No lenders evaluated';
        } else if (matchCount === 0) {
            countText = `${totalCount} lender${totalCount > 1 ? 's' : ''} evaluated`;
        } else {
            countText = `${matchCount} match${matchCount > 1 ? 'es' : ''} found (${totalCount} total)`;
        }

        if (isHypothetical) {
            countText += ' - HYPOTHETICAL SCENARIO';
        }

        solutionsCount.textContent = countText;

        // Sort matches: matches first (by confidence), then non-matches (by name)
        if (matches && matches.length > 0) {
            const sortedMatches = matches.sort((a, b) => {
                if (a.isMatch && !b.isMatch) return -1;
                if (!a.isMatch && b.isMatch) return 1;
                if (a.isMatch && b.isMatch) return b.confidence - a.confidence;
                return a.lenderName.localeCompare(b.lenderName);
            });

            // Create and animate cards
            sortedMatches.forEach((match, index) => {
                setTimeout(() => {
                    const cardElement = this.createLenderCard(match, isHypothetical, hypotheticalChanges);
                    solutionCards.appendChild(cardElement);

                    // Trigger animation
                    requestAnimationFrame(() => {
                        cardElement.classList.add('visible');
                    });
                }, index * 200);
            });
        } else {
            // Show no results message
            const noResultsCard = this.createNoResultsCard();
            solutionCards.appendChild(noResultsCard);
        }
    }
    
    createLenderCard(lenderMatch, isHypothetical = false, hypotheticalChanges = null) {
        const cardDiv = document.createElement('div');
        const isMatch = lenderMatch.isMatch === true;
        cardDiv.className = `solution-card ${isMatch ? 'match' : 'no-match'} ${isHypothetical ? 'hypothetical' : ''}`;

        const scoreBadge = lenderMatch.confidence > 0.8 ? 'excellent' :
                          lenderMatch.confidence > 0.6 ? 'good' : 'fair';

        const matchText = isMatch ?
            `${Math.round(lenderMatch.confidence * 100)}% match` :
            'Not a match';

        const badgeClass = isMatch ? scoreBadge : 'no-match';

        // Create contact buttons HTML
        const contactButtons = [];
        if (lenderMatch.contact_phone) {
            contactButtons.push(`<button class="contact-btn phone-btn" onclick="window.open('tel:${lenderMatch.contact_phone}', '_self')">
                📞 Call
            </button>`);
        }
        if (lenderMatch.website) {
            contactButtons.push(`<button class="contact-btn website-btn" onclick="window.open('${lenderMatch.website}', '_blank', 'noopener,noreferrer')">
                🌐 Website
            </button>`);
        }
        if (lenderMatch.department_contacts && Object.keys(lenderMatch.department_contacts).length > 0) {
            const emailOptions = Object.entries(lenderMatch.department_contacts)
                .map(([dept, email]) => `<option value="${email}">${dept}: ${email}</option>`)
                .join('');
            contactButtons.push(`<select class="contact-btn email-select" onchange="if(this.value) { window.open('mailto:' + this.value); this.value=''; }">
                <option value="">📧 Contact...</option>
                ${emailOptions}
            </select>`);
        }

        const contactButtonsHtml = contactButtons.length > 0 ?
            `<div class="contact-buttons">${contactButtons.join('')}</div>` : '';

        const hypotheticalIndicator = isHypothetical ?
            `<div class="hypothetical-indicator">⚠️ Hypothetical Scenario</div>` : '';

        cardDiv.innerHTML = `
            <div class="lender-header">
                <h3 class="card-title">${lenderMatch.lenderName}</h3>
                <div class="confidence-badge ${badgeClass}">
                    ${matchText}
                </div>
            </div>
            <p class="card-subtitle">${lenderMatch.programName || lenderMatch.lenderName}</p>
            ${hypotheticalIndicator}
            <div class="match-reason">
                <p>${isMatch ? (lenderMatch.matchSummary || 'Good match for your profile') : (lenderMatch.nonMatchReason || 'Does not meet requirements')}</p>
            </div>
            <div class="lender-details">
                ${lenderMatch.maxLTV ? `
                <div class="detail-row">
                    <span class="detail-label">Max LTV:</span>
                    <span class="detail-value">${lenderMatch.maxLTV}%</span>
                </div>
                ` : ''}
                ${lenderMatch.minCreditScore ? `
                <div class="detail-row">
                    <span class="detail-label">Min Credit Score:</span>
                    <span class="detail-value">${lenderMatch.minCreditScore}</span>
                </div>
                ` : ''}
                ${lenderMatch.maxLoanAmount ? `
                <div class="detail-row">
                    <span class="detail-label">Max Loan:</span>
                    <span class="detail-value">$${lenderMatch.maxLoanAmount.toLocaleString()}</span>
                </div>
                ` : ''}
            </div>
            ${contactButtonsHtml}
            <div class="card-actions">
                <button class="card-cta secondary" onclick="window.app.askAboutLender('${lenderMatch.lenderName}', '${lenderMatch.programName || lenderMatch.lenderName}')">
                    Ask About This Lender
                </button>
            </div>
        `;

        return cardDiv;
    }

    showIncompleteInfoCard() {
        const solutionCards = document.getElementById('solution-cards');
        const solutionsCount = document.getElementById('solutions-count');

        // Clear existing cards
        solutionCards.innerHTML = '';

        // Update count
        solutionsCount.textContent = 'Information needed';

        // Create and add incomplete info card
        const cardElement = this.createIncompleteInfoCard();
        solutionCards.appendChild(cardElement);

        // Trigger animation
        requestAnimationFrame(() => {
            cardElement.classList.add('visible');
        });
    }

    createIncompleteInfoCard() {
        const cardDiv = document.createElement('div');
        cardDiv.className = 'solution-card incomplete-info';

        cardDiv.innerHTML = `
            <div class="incomplete-info-content">
                <h3 class="card-title">More Information Needed</h3>
                <p class="card-subtitle">To provide personalized lender recommendations, I need additional details about your situation.</p>
                <div class="info-needed">
                    <p>Please provide this information through the Deal Analysis chatbot:</p>
                    <ul class="required-info-list">
                        <li>Property Value</li>
                        <li>Property Type</li>
                        <li>Credit Score</li>
                        <li>Down Payment Percentage</li>
                        <li>Investment Experience</li>
                    </ul>
                </div>
                <p class="help-text">Once you provide this information, I'll be able to show you all available lenders with detailed match analysis and contact information.</p>
            </div>
        `;

        return cardDiv;
    }

    createNoResultsCard() {
        const cardDiv = document.createElement('div');
        cardDiv.className = 'solution-card no-results';

        cardDiv.innerHTML = `
            <div class="no-results-content">
                <h3 class="card-title">No Perfect Matches Found</h3>
                <p class="card-subtitle">Don't worry! Here are some suggestions to improve your options:</p>
                <ul class="suggestions-list">
                    <li>Consider increasing your down payment by 5-10%</li>
                    <li>Work on improving your credit score</li>
                    <li>Look into alternative documentation programs</li>
                    <li>Consider DSCR (Debt Service Coverage Ratio) loans</li>
                </ul>
                <button class="card-cta" onclick="document.getElementById('investor-form').reset(); document.querySelector('.investor-form').scrollIntoView();">
                    Adjust Criteria →
                </button>
            </div>
        `;

        return cardDiv;
    }
    
    showFormError(message) {
        // Create temporary error message
        const errorDiv = document.createElement('div');
        errorDiv.className = 'form-error';
        errorDiv.textContent = message;
        errorDiv.style.cssText = `
            position: fixed;
            top: 100px;
            left: 50%;
            transform: translateX(-50%);
            background: rgba(239, 68, 68, 0.9);
            color: white;
            padding: 1rem 2rem;
            border-radius: 8px;
            z-index: 3000;
            box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
        `;

        document.body.appendChild(errorDiv);

        setTimeout(() => {
            errorDiv.remove();
        }, 4000);
    }

    showLoadingScreen() {
        document.getElementById('loading-overlay').classList.add('active');
    }

    hideLoadingScreen() {
        document.getElementById('loading-overlay').classList.remove('active');
    }
}

// Service Classes

// Chat Service for OpenAI Integration
class ChatService {
    constructor() {
        this.conversationHistory = [];
        this.apiEndpoint = getApiBaseUrl() + '/api/chat';
        this.isTyping = false;
        // Session state tracking for accumulated conversation changes
        this.sessionState = {
            mentionedParameters: {},
            parameterHistory: [], // Track when parameters were mentioned
            corrections: [] // Track when user corrects themselves
        };
    }

    async sendMessage(message, userContext = null, propertyInsights = null) {
        if (!message.trim()) return;

        try {
            // Add user message to UI
            this.displayMessage(message, 'user');

            // Show typing indicator
            this.showTypingIndicator();

            // Prepare request payload
            const userCtx = userContext || this.getUserContext();
            const payload = {
                message: message.trim(),
                userContext: userCtx,
                conversationHistory: this.conversationHistory
            };
            
            console.log('📨 Sending chat message:');
            console.log('  - Message:', message.trim());
            console.log('  - Conversation history length:', this.conversationHistory.length);
            console.log('  - User context:', JSON.stringify(userCtx, null, 2));

            // Include property insights if available
            if (propertyInsights) {
                payload.propertyInsights = propertyInsights;
            } else if (window.app && window.app.propertyInsights) {
                payload.propertyInsights = window.app.propertyInsights;
            }

            // Make API call with retry logic
            const response = await retryApiCall(async () => {
                const res = await fetch(this.apiEndpoint, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(payload)
                });

                if (!res.ok) {
                    const errorData = await res.json().catch(() => ({ error: 'Unknown error' }));
                    const error = new Error(errorData.error || `HTTP ${res.status}`);
                    error.status = res.status;
                    throw error;
                }

                return res;
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || `HTTP ${response.status}`);
            }

            const data = await response.json();

            // Hide typing indicator
            this.hideTypingIndicator();

            // Add bot response to UI
            this.displayMessage(data.response, 'bot');

            // Check for lender matches in response and update cards if present
            if (data.lenderMatches && Array.isArray(data.lenderMatches) && data.lenderMatches.length > 0) {
                // Update current matches for context
                if (window.app) {
                    window.app.currentMatches = data.lenderMatches;
                    // Update the lender cards dynamically
                    window.app.showLenderCards(data.lenderMatches);
                }
            } else {
                // Check if user is asking for lender recommendations and get new matches
                const lowerMessage = message.toLowerCase();
                const recommendationKeywords = [
                    'recommend', 'suggest', 'other lenders', 'better options',
                    'alternative', 'different lender', 'more options', 'other choices',
                    'what about', 'what else', 'any other'
                ];

                const isAskingForRecommendations = recommendationKeywords.some(keyword =>
                    lowerMessage.includes(keyword)
                );

                // Check if user is mentioning changes to deal parameters
                const parameterChanges = this.detectParameterChanges(message);
                console.log('🔍 Parameter detection result:', parameterChanges);

                // Handle parameter changes - different behavior for hypotheticals vs actual changes
                if (parameterChanges.hasChanges) {
                    // Only update form fields if this is NOT a hypothetical scenario
                    if (!parameterChanges.isHypothetical) {
                        this.updateFormFieldsFromChat(parameterChanges);
                    }

                    // ALWAYS get new lender matches when parameters change
                    try {
                        let formData = window.app.collectFormData();
                        console.log('📋 Form data before applying changes:', formData);
                        formData = this.applyParameterChanges(formData, parameterChanges);
                        console.log('📋 Form data after applying changes:', formData);

                        console.log('🔄 Parameters changed, getting new lender matches with:', formData);

                        const result = await window.app.findMatchingLenders(formData);
                        const newMatches = result.matches || [];
                        const requiresMoreInfo = result.requiresMoreInfo || false;

                        if (requiresMoreInfo) {
                            // Don't call displayResults() if Q&A is already active - chatbot will ask for more info
                            const qaLayout = document.getElementById('qa-layout');
                            if (!qaLayout.classList.contains('active')) {
                                window.app.displayResults([], true);
                            }
                            // If Q&A is active, just update the status indicator
                            else {
                                const statusIndicator = document.querySelector('.status-indicator span');
                                const statusDot = document.querySelector('.status-dot');
                                if (statusIndicator && statusDot) {
                                    statusIndicator.textContent = 'More information needed';
                                    statusDot.style.background = '#f59e0b';
                                }
                            }
                        } else if (newMatches && newMatches.length > 0) {
                            // Got new matches, update display
                            console.log('🎯 Found new matches:', newMatches.length, 'lenders');
                            window.app.currentMatches = newMatches;
                            window.app.showLenderCards(newMatches, parameterChanges.isHypothetical, parameterChanges);
                            console.log('✅ Updated lender cards with', newMatches.length, 'lenders');

                            // Update status indicator for successful matches
                            const statusIndicator = document.querySelector('.status-indicator span');
                            const statusDot = document.querySelector('.status-dot');
                            if (statusIndicator && statusDot) {
                                statusIndicator.textContent = `${newMatches.length} lenders found`;
                                statusDot.style.background = '#10b981';
                                console.log('📊 Updated status indicator to:', statusIndicator.textContent);
                            } else {
                                console.log('⚠️ Status indicator elements not found');
                            }
                        } else {
                            console.log('❌ No lender matches found, newMatches:', newMatches);
                        }
                    } catch (error) {
                        console.error('Failed to get new lender recommendations:', error);
                    }
                } else if (isAskingForRecommendations && window.app && window.app.currentMatches) {
                    // User is asking for recommendations without parameter changes
                    try {
                        let formData = window.app.collectFormData();
                        const result = await window.app.findMatchingLenders(formData);
                        const newMatches = result.matches || [];
                        const requiresMoreInfo = result.requiresMoreInfo || false;

                        if (requiresMoreInfo) {
                            // Don't call displayResults() if Q&A is already active - chatbot will ask for more info
                            const qaLayout = document.getElementById('qa-layout');
                            if (!qaLayout.classList.contains('active')) {
                                window.app.displayResults([], true);
                            }
                            // If Q&A is active, just update the status indicator
                            else {
                                const statusIndicator = document.querySelector('.status-indicator span');
                                const statusDot = document.querySelector('.status-dot');
                                if (statusIndicator && statusDot) {
                                    statusIndicator.textContent = 'More information needed';
                                    statusDot.style.background = '#f59e0b';
                                }
                            }
                        } else if (newMatches && newMatches.length > 0) {
                            window.app.currentMatches = newMatches;
                            window.app.showLenderCards(newMatches);
                            // Update status indicator for successful matches
                            const statusIndicator = document.querySelector('.status-indicator span');
                            const statusDot = document.querySelector('.status-dot');
                            if (statusIndicator && statusDot) {
                                statusIndicator.textContent = `${newMatches.length} lenders found`;
                                statusDot.style.background = '#10b981';
                            }
                        }
                    } catch (error) {
                        console.log('Could not get new lender recommendations:', error);
                    }
                }
            }

            // Update conversation history
            this.updateConversationHistory(message, data.response);

            return data;

        } catch (error) {
            console.error('Chat error:', error);
            this.hideTypingIndicator();

            // Provide user-friendly error messages
            let errorMessage = 'Sorry, I\'m having trouble connecting right now. Please try again in a moment.';

            if (error.message.includes('timeout')) {
                errorMessage = 'The request is taking longer than expected. Please try again.';
            } else if (error.message.includes('fetch') || error.message.includes('network')) {
                errorMessage = 'There seems to be a connection issue. Please check your internet and try again.';
            } else if (error.message.includes('Service temporarily unavailable')) {
                errorMessage = 'Our chat service is temporarily unavailable. Please try again later or contact our team directly.';
            }

            this.displayMessage(errorMessage, 'bot', true);
            throw error;
        }
    }

    displayMessage(message, sender, isError = false) {
        const chatMessages = document.getElementById('chat-messages');
        const messageDiv = document.createElement('div');

        // Map sender to correct CSS class names
        const cssClass = sender === 'bot' ? 'deal-desk' : 'agent';
        messageDiv.className = `message ${cssClass}`;

        const messageContent = document.createElement('div');
        messageContent.className = 'message-content';

        if (isError) {
            messageContent.classList.add('error');
        }

        // Format message with basic markdown-like formatting
        messageContent.innerHTML = this.formatMessage(message);

        messageDiv.appendChild(messageContent);
        chatMessages.appendChild(messageDiv);

        // Scroll to bottom
        chatMessages.scrollTop = chatMessages.scrollHeight;

        // Trigger animation
        requestAnimationFrame(() => {
            messageDiv.classList.add('visible');
        });
    }

    formatMessage(text) {
        // Basic formatting for common patterns
        return text
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>') // Bold
            .replace(/\*(.*?)\*/g, '<em>$1</em>') // Italic
            .replace(/`([^`]+)`/g, '<code>$1</code>') // Code
            .replace(/\n/g, '<br>'); // Line breaks
    }

    showTypingIndicator() {
        this.isTyping = true;
        const chatMessages = document.getElementById('chat-messages');
        const typingDiv = document.createElement('div');
        typingDiv.className = 'message bot typing-indicator';
        typingDiv.id = 'typing-indicator';

        typingDiv.innerHTML = `
            <div class="message-content">
                <div class="typing-dots">
                    <span></span>
                    <span></span>
                    <span></span>
                </div>
            </div>
        `;

        chatMessages.appendChild(typingDiv);
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }

    hideTypingIndicator() {
        this.isTyping = false;
        const typingIndicator = document.getElementById('typing-indicator');
        if (typingIndicator) {
            typingIndicator.remove();
        }
    }

    getUserContext() {
        // Get current form data and lender matches for context
        const formData = window.app ? window.app.collectFormData() : null;
        const lenderMatches = window.app ? window.app.currentMatches : null;

        // Build conversation changes summary
        let conversationChanges = null;
        if (this.sessionState.parameterHistory.length > 0) {
            const changes = [];
            for (const [param, value] of Object.entries(this.sessionState.mentionedParameters)) {
                const label = {
                    creditScore: 'Credit Score',
                    downPaymentPercent: 'Down Payment',
                    propertyValue: 'Property Value',
                    propertyType: 'Property Type',
                    investmentExperience: 'Investment Experience'
                }[param] || param;
                changes.push(`${label}: ${value}`);
            }
            if (changes.length > 0) {
                conversationChanges = `User mentioned in conversation: ${changes.join(', ')}`;
            }
            
            // Add corrections if any
            if (this.sessionState.corrections.length > 0) {
                const corrections = this.sessionState.corrections.map(c => 
                    `${c.parameter} corrected from ${c.oldValue} to ${c.newValue}`
                ).join('; ');
                conversationChanges += `. Corrections: ${corrections}`;
            }
        }

        return {
            formData: formData,
            lenderMatches: lenderMatches,
            conversationChanges: conversationChanges,
            sessionState: this.sessionState,
            helpFieldInput: this.sessionState.helpFieldInput,
            helpFieldTimestamp: this.sessionState.helpFieldTimestamp,
            timestamp: new Date().toISOString()
        };
    }

    updateConversationHistory(userMessage, botResponse) {
        // Keep conversation history for context (limit to last 10 exchanges)
        this.conversationHistory.push(
            { role: 'user', content: userMessage },
            { role: 'assistant', content: botResponse }
        );

        // Keep only last 10 messages (20 items since each exchange is 2 messages)
        if (this.conversationHistory.length > 20) {
            this.conversationHistory = this.conversationHistory.slice(-20);
        }
    }

    clearHistory() {
        this.conversationHistory = [];
        this.hideTypingIndicator();
        // Also clear session state for new conversation
        this.sessionState = {
            mentionedParameters: {},
            parameterHistory: [],
            corrections: []
        };
        console.log('🔄 Conversation history and session state cleared');
    }

    updateApiEndpoint(newEndpoint) {
        this.apiEndpoint = newEndpoint;
    }

    detectParameterChanges(message) {
        const lowerMessage = message.toLowerCase();
        const changes = {
            hasChanges: false,
            isHypothetical: false,
            creditScore: null,
            downPaymentPercent: null,
            propertyValue: null,
            propertyType: null,
            investmentExperience: null,
            propertyLocation: null
        };

        // Detect if this is a hypothetical scenario
        const hypotheticalPatterns = [
            /what\s+if/i,
            /suppose\s+(?:i|my|we)/i,
            /imagine\s+(?:i|my|we)/i,
            /if\s+(?:i|my|we)\s+(?:had|was|were|could)/i,
            /hypothetically/i,
            /assuming/i,
            /let['']?s\s+say/i
        ];

        for (const pattern of hypotheticalPatterns) {
            if (pattern.test(message)) {
                changes.isHypothetical = true;
                console.log('🔍 Detected hypothetical language');
                break;
            }
        }

        // Detect credit score changes - including hypothetical changes
        const creditPatterns = [
            /credit score.*?(\d{3})/i,
            /credit.*?(\d{3})/i,
            /score.*?(\d{3})/i,
            /(\d{3}).*?credit/i,
            /actually.*?(\d{3})/i,
            /my.*?credit.*?(\d{3})/i,
            /(\d+)\s*points?\s+(?:lower|higher|less|more|better|worse)/i,  // "100 points lower"
            /if.*?credit.*?(?:was|were|is)\s*(\d{3})/i,  // "if my credit was 660"
            /what.*?if.*?credit.*?(\d{3})/i  // "what if my credit score is 660"
        ];

        for (const pattern of creditPatterns) {
            const match = message.match(pattern);
            if (match && match[1]) {
                let score = parseInt(match[1]);
                
                // Check if this is a relative change (e.g., "100 points lower")
                if (/points?\s+(?:lower|less|worse)/i.test(message)) {
                    // Get current credit score from form
                    const currentScore = window.app ? window.app.collectFormData().creditScore : null;
                    if (currentScore && score < 500) {  // Likely a points change, not an absolute score
                        score = currentScore - score;
                    }
                } else if (/points?\s+(?:higher|more|better)/i.test(message)) {
                    const currentScore = window.app ? window.app.collectFormData().creditScore : null;
                    if (currentScore && score < 500) {
                        score = currentScore + score;
                    }
                }
                
                if (score >= 300 && score <= 850) {
                    changes.creditScore = score;
                    changes.hasChanges = true;
                    console.log('🔍 Detected credit score change:', score);
                    break;
                }
            }
        }

        // Detect down payment percentage changes
        const downPaymentPatterns = [
            /down.*?payment.*?(\d+)%/i,
            /put.*?down.*?(\d+)%/i,
            /(\d+)%.*?down/i,
            /down.*?(\d+)%/i,
            /(\d+).*?percent.*?down/i
        ];

        for (const pattern of downPaymentPatterns) {
            const match = message.match(pattern);
            if (match && match[1]) {
                const percent = parseInt(match[1]);
                if (percent >= 0 && percent <= 50) {
                    changes.downPaymentPercent = percent;
                    changes.hasChanges = true;
                    break;
                }
            }
        }

        // Detect property value changes
        const propertyValuePatterns = [
            /property.*?value.*?\$?(\d+(?:,\d{3})*(?:\.\d{2})?)/i,
            /property.*?worth.*?\$?(\d+(?:,\d{3})*(?:\.\d{2})?)/i,
            /valued.*?at.*?\$?(\d+(?:,\d{3})*(?:\.\d{2})?)/i,
            /\$(\d+(?:,\d{3})*(?:\.\d{2})?).*?(?:property|home|house|condo|single family|duplex|triplex|fourplex|townhouse)/i,
            /worth.*?\$(\d+(?:,\d{3})*(?:\.\d{2})?)/i,
            /(\d+(?:,\d{3})*(?:\.\d{2})?)k?\s*(?:property|home|house|condo|single family|duplex|triplex|fourplex|townhouse)/i
        ];

        for (const pattern of propertyValuePatterns) {
            const match = message.match(pattern);
            if (match && match[1]) {
                const valueStr = match[1].replace(/,/g, '');
                let value = parseFloat(valueStr);
                
                // Check if 'k' suffix is present (e.g., "300k")
                if (/\d+k\s/i.test(match[0]) && value < 10000) {
                    value = value * 1000;
                }
                
                if (value >= 50000 && value <= 10000000) {
                    changes.propertyValue = value;
                    changes.hasChanges = true;
                    console.log('🔍 Detected property value change:', value);
                    break;
                }
            }
        }

        // Detect property type changes
        const propertyTypeMappings = {
            'single family': 'single_family',
            'single-family': 'single_family',
            'duplex': 'duplex',
            'triplex': 'triplex',
            'fourplex': 'fourplex',
            'condo': 'condo',
            'townhouse': 'townhouse',
            'town home': 'townhouse'
        };

        for (const [text, value] of Object.entries(propertyTypeMappings)) {
            if (lowerMessage.includes(text)) {
                changes.propertyType = value;
                changes.hasChanges = true;
                break;
            }
        }

        // Detect investment experience changes
        const experienceMappings = {
            'first-time': 'first_time',
            'first time': 'first_time',
            'some experience': 'some_experience',
            'experienced': 'experienced',
            'professional': 'professional'
        };

        for (const [text, value] of Object.entries(experienceMappings)) {
            if (lowerMessage.includes(text)) {
                changes.investmentExperience = value;
                changes.hasChanges = true;
                break;
            }
        }

        // Detect property location changes
        const locationPatterns = [
            // "property in Phoenix, AZ" (abbreviated state)
            /property\s+(?:in|at|near|around|for)\s+([A-Za-z]+(?:\s+[A-Za-z]+)*),\s*([A-Z]{2})\b/i,
            // "property in Los Angeles, California" (full state name - limit to 1-3 words)
            /property\s+(?:in|at|near|around|for)\s+([A-Za-z]+(?:\s+[A-Za-z]+)*),\s*([A-Za-z]+(?:\s+[A-Za-z]+){0,2})\b/i,
            // "loan on a property in Phoenix, AZ" (abbreviated state)
            /loan.*?(?:in|at|near|around|for)\s+([A-Za-z]+(?:\s+[A-Za-z]+)*),\s*([A-Z]{2})\b/i,
            // "loan on a property in Los Angeles, California" (full state name)
            /loan.*?(?:in|at|near|around|for)\s+([A-Za-z]+(?:\s+[A-Za-z]+)*),\s*([A-Za-z]+(?:\s+[A-Za-z]+){0,2})\b/i,
            // "in Phoenix, AZ" - general preposition (abbreviated)
            /(?:in|at|near|around|for)\s+([A-Za-z]+(?:\s+[A-Za-z]+)*),\s*([A-Z]{2})\b/i,
            // "in Los Angeles, California" - general preposition (full state)
            /(?:in|at|near|around|for)\s+([A-Za-z]+(?:\s+[A-Za-z]+)*),\s*([A-Za-z]+(?:\s+[A-Za-z]+){0,2})\b/i,
            // "Los Angeles, California" - direct full state pattern
            /([A-Za-z]+(?:\s+[A-Za-z]+)*),\s*([A-Za-z]+(?:\s+[A-Za-z]+){0,2})\b/i,
            // "Phoenix, AZ" - direct abbreviated pattern
            /,\s*([A-Za-z]+(?:\s+[A-Za-z]+)*),\s*([A-Z]{2})\b/i
        ];

        for (const pattern of locationPatterns) {
            const match = message.match(pattern);
            if (match && match.length >= 3) {
                const city = match[1].trim();
                let state = match[2].trim();

                // Convert full state names to abbreviations
                const stateMap = {
                    'alabama': 'AL', 'alaska': 'AK', 'arizona': 'AZ', 'arkansas': 'AR',
                    'california': 'CA', 'colorado': 'CO', 'connecticut': 'CT', 'delaware': 'DE',
                    'florida': 'FL', 'georgia': 'GA', 'hawaii': 'HI', 'idaho': 'ID',
                    'illinois': 'IL', 'indiana': 'IN', 'iowa': 'IA', 'kansas': 'KS',
                    'kentucky': 'KY', 'louisiana': 'LA', 'maine': 'ME', 'maryland': 'MD',
                    'massachusetts': 'MA', 'michigan': 'MI', 'minnesota': 'MN', 'mississippi': 'MS',
                    'missouri': 'MO', 'montana': 'MT', 'nebraska': 'NE', 'nevada': 'NV',
                    'new hampshire': 'NH', 'new jersey': 'NJ', 'new mexico': 'NM', 'new york': 'NY',
                    'north carolina': 'NC', 'north dakota': 'ND', 'ohio': 'OH', 'oklahoma': 'OK',
                    'oregon': 'OR', 'pennsylvania': 'PA', 'rhode island': 'RI', 'south carolina': 'SC',
                    'south dakota': 'SD', 'tennessee': 'TN', 'texas': 'TX', 'utah': 'UT',
                    'vermont': 'VT', 'virginia': 'VA', 'washington': 'WA', 'west virginia': 'WV',
                    'wisconsin': 'WI', 'wyoming': 'WY'
                };

                // Validate that the state is actually a valid state name
                let finalState = null;
                if (state.length === 2 && /^[A-Z]{2}$/.test(state)) {
                    // Already abbreviated
                    finalState = state.toUpperCase();
                } else if (state.length > 2) {
                    // Check if it's a full state name
                    const normalizedState = state.toLowerCase().split(' ')[0]; // Take first word only
                    finalState = stateMap[normalizedState];
                }

                // Basic validation - city should be reasonable length, valid state
                if (city.length >= 2 && city.length <= 50 && finalState && /^[A-Z]{2}$/.test(finalState)) {
                    changes.propertyLocation = `${city}, ${finalState}`;
                    changes.hasChanges = true;
                    console.log('🔍 Detected location change:', changes.propertyLocation);
                    break;
                }
            }
        }

        return changes;
    }

    applyParameterChanges(formData, changes) {
        const updatedFormData = { ...formData };

        if (changes.creditScore !== null) {
            updatedFormData.creditScore = changes.creditScore;
        }

        if (changes.downPaymentPercent !== null) {
            updatedFormData.downPaymentPercent = changes.downPaymentPercent;
        }

        if (changes.propertyValue !== null) {
            updatedFormData.propertyValue = changes.propertyValue;
        }

        if (changes.propertyType !== null) {
            updatedFormData.propertyType = changes.propertyType;
        }

        if (changes.investmentExperience !== null) {
            updatedFormData.investmentExperience = changes.investmentExperience;
        }

        if (changes.propertyLocation !== null) {
            updatedFormData.propertyLocation = changes.propertyLocation;
        }

        return updatedFormData;
    }

    updateFormFieldsFromChat(parameterChanges) {
        // Update actual HTML form fields so changes persist across messages
        if (parameterChanges.creditScore !== null) {
            const creditScoreField = document.getElementById('credit-score');
            if (creditScoreField) {
                creditScoreField.value = parameterChanges.creditScore;
                // Add visual indicator that this was updated from chat
                creditScoreField.style.borderColor = '#8b5cf6';
                creditScoreField.style.boxShadow = '0 0 15px rgba(139, 92, 246, 0.5)';
                setTimeout(() => {
                    creditScoreField.style.borderColor = '';
                    creditScoreField.style.boxShadow = '';
                }, 2000);
            }
        }
        
        if (parameterChanges.downPaymentPercent !== null) {
            const dropdown = document.getElementById('down-payment-percent');
            if (dropdown) {
                // Convert percentage to dropdown value
                if (parameterChanges.downPaymentPercent < 15) dropdown.value = 'under_15';
                else if (parameterChanges.downPaymentPercent < 20) dropdown.value = '15';
                else if (parameterChanges.downPaymentPercent < 25) dropdown.value = '20';
                else if (parameterChanges.downPaymentPercent < 30) dropdown.value = '25';
                else dropdown.value = '30_plus';
                
                // Visual indicator
                dropdown.style.borderColor = '#8b5cf6';
                dropdown.style.boxShadow = '0 0 15px rgba(139, 92, 246, 0.5)';
                setTimeout(() => {
                    dropdown.style.borderColor = '';
                    dropdown.style.boxShadow = '';
                }, 2000);
            }
        }
        
        if (parameterChanges.propertyValue !== null) {
            const propertyValueField = document.getElementById('property-value');
            if (propertyValueField) {
                propertyValueField.value = parameterChanges.propertyValue;
                // Visual indicator
                propertyValueField.style.borderColor = '#8b5cf6';
                propertyValueField.style.boxShadow = '0 0 15px rgba(139, 92, 246, 0.5)';
                setTimeout(() => {
                    propertyValueField.style.borderColor = '';
                    propertyValueField.style.boxShadow = '';
                }, 2000);
            }
        }
        
        if (parameterChanges.propertyType !== null) {
            const propertyTypeField = document.getElementById('property-type');
            if (propertyTypeField) {
                propertyTypeField.value = parameterChanges.propertyType;
                // Visual indicator
                propertyTypeField.style.borderColor = '#8b5cf6';
                propertyTypeField.style.boxShadow = '0 0 15px rgba(139, 92, 246, 0.5)';
                setTimeout(() => {
                    propertyTypeField.style.borderColor = '';
                    propertyTypeField.style.boxShadow = '';
                }, 2000);
            }
        }
        
        if (parameterChanges.investmentExperience !== null) {
            const experienceField = document.getElementById('investment-experience');
            if (experienceField) {
                experienceField.value = parameterChanges.investmentExperience;
                // Visual indicator
                experienceField.style.borderColor = '#8b5cf6';
                experienceField.style.boxShadow = '0 0 15px rgba(139, 92, 246, 0.5)';
                setTimeout(() => {
                    experienceField.style.borderColor = '';
                    experienceField.style.boxShadow = '';
                }, 2000);
            }
        }

        if (parameterChanges.propertyLocation !== null) {
            const locationField = document.getElementById('property-location');
            if (locationField) {
                locationField.value = parameterChanges.propertyLocation;
                // Visual indicator
                locationField.style.borderColor = '#8b5cf6';
                locationField.style.boxShadow = '0 0 15px rgba(139, 92, 246, 0.5)';
                setTimeout(() => {
                    locationField.style.borderColor = '';
                    locationField.style.boxShadow = '';
                }, 2000);
            }
        }

        console.log('✅ Form fields updated from chat:', parameterChanges);
        
        // Update session state with these changes
        this.updateSessionState(parameterChanges);
    }

    updateSessionState(parameterChanges) {
        // Track parameter changes in session state
        const timestamp = new Date().toISOString();
        
        if (parameterChanges.creditScore !== null) {
            const oldValue = this.sessionState.mentionedParameters.creditScore;
            this.sessionState.mentionedParameters.creditScore = parameterChanges.creditScore;
            this.sessionState.parameterHistory.push({
                parameter: 'creditScore',
                value: parameterChanges.creditScore,
                timestamp: timestamp,
                isCorrection: oldValue !== undefined
            });
            if (oldValue !== undefined && oldValue !== parameterChanges.creditScore) {
                this.sessionState.corrections.push({
                    parameter: 'creditScore',
                    oldValue: oldValue,
                    newValue: parameterChanges.creditScore,
                    timestamp: timestamp
                });
            }
        }
        
        if (parameterChanges.downPaymentPercent !== null) {
            const oldValue = this.sessionState.mentionedParameters.downPaymentPercent;
            this.sessionState.mentionedParameters.downPaymentPercent = parameterChanges.downPaymentPercent;
            this.sessionState.parameterHistory.push({
                parameter: 'downPaymentPercent',
                value: parameterChanges.downPaymentPercent,
                timestamp: timestamp,
                isCorrection: oldValue !== undefined
            });
            if (oldValue !== undefined && oldValue !== parameterChanges.downPaymentPercent) {
                this.sessionState.corrections.push({
                    parameter: 'downPaymentPercent',
                    oldValue: oldValue,
                    newValue: parameterChanges.downPaymentPercent,
                    timestamp: timestamp
                });
            }
        }
        
        if (parameterChanges.propertyValue !== null) {
            const oldValue = this.sessionState.mentionedParameters.propertyValue;
            this.sessionState.mentionedParameters.propertyValue = parameterChanges.propertyValue;
            this.sessionState.parameterHistory.push({
                parameter: 'propertyValue',
                value: parameterChanges.propertyValue,
                timestamp: timestamp,
                isCorrection: oldValue !== undefined
            });
            if (oldValue !== undefined && oldValue !== parameterChanges.propertyValue) {
                this.sessionState.corrections.push({
                    parameter: 'propertyValue',
                    oldValue: oldValue,
                    newValue: parameterChanges.propertyValue,
                    timestamp: timestamp
                });
            }
        }
        
        if (parameterChanges.propertyType !== null) {
            const oldValue = this.sessionState.mentionedParameters.propertyType;
            this.sessionState.mentionedParameters.propertyType = parameterChanges.propertyType;
            this.sessionState.parameterHistory.push({
                parameter: 'propertyType',
                value: parameterChanges.propertyType,
                timestamp: timestamp,
                isCorrection: oldValue !== undefined
            });
            if (oldValue !== undefined && oldValue !== parameterChanges.propertyType) {
                this.sessionState.corrections.push({
                    parameter: 'propertyType',
                    oldValue: oldValue,
                    newValue: parameterChanges.propertyType,
                    timestamp: timestamp
                });
            }
        }
        
        if (parameterChanges.investmentExperience !== null) {
            const oldValue = this.sessionState.mentionedParameters.investmentExperience;
            this.sessionState.mentionedParameters.investmentExperience = parameterChanges.investmentExperience;
            this.sessionState.parameterHistory.push({
                parameter: 'investmentExperience',
                value: parameterChanges.investmentExperience,
                timestamp: timestamp,
                isCorrection: oldValue !== undefined
            });
            if (oldValue !== undefined && oldValue !== parameterChanges.investmentExperience) {
                this.sessionState.corrections.push({
                    parameter: 'investmentExperience',
                    oldValue: oldValue,
                    newValue: parameterChanges.investmentExperience,
                    timestamp: timestamp
                });
            }
        }

        if (parameterChanges.propertyLocation !== null) {
            const oldValue = this.sessionState.mentionedParameters.propertyLocation;
            this.sessionState.mentionedParameters.propertyLocation = parameterChanges.propertyLocation;
            this.sessionState.parameterHistory.push({
                parameter: 'propertyLocation',
                value: parameterChanges.propertyLocation,
                timestamp: timestamp,
                isCorrection: oldValue !== undefined
            });
            if (oldValue !== undefined && oldValue !== parameterChanges.propertyLocation) {
                this.sessionState.corrections.push({
                    parameter: 'propertyLocation',
                    oldValue: oldValue,
                    newValue: parameterChanges.propertyLocation,
                    timestamp: timestamp
                });
            }
        }

        console.log('📝 Session state updated:', this.sessionState);
    }
}

// Lender Database Service
class LenderService {
    constructor() {
        this.lenderDatabase = null;
        this.databasePath = './lender_details/Comprehensive/comprehensive_lender_database.json';
    }

    async loadLenderDatabase() {
        try {
            const response = await fetch(this.databasePath);
            if (!response.ok) {
                throw new Error(`Failed to load lender database: ${response.status}`);
            }
            this.lenderDatabase = await response.json();
            console.log('Lender database loaded successfully');
        } catch (error) {
            console.error('Error loading lender database:', error);
            throw error;
        }
    }

    findMatchesByRules(buyerProfile) {
        if (!this.lenderDatabase) {
            throw new Error('Lender database not loaded');
        }

        console.log('Running rule-based matching with profile:', buyerProfile);

        const matches = [];
        const lenders = this.lenderDatabase.lenders;

        // Convert buyer profile to loan amount
        const loanAmount = buyerProfile.propertyValue ?
            buyerProfile.propertyValue * (1 - (buyerProfile.downPaymentPercent || 20) / 100) : null;

        console.log('Calculated loan amount:', loanAmount);
        console.log('Processing', Object.keys(lenders).length, 'lenders');

        for (const [lenderKey, lenderData] of Object.entries(lenders)) {
            const lenderMatches = this.scoreLenderMatch(lenderKey, lenderData, buyerProfile, loanAmount);
            console.log(`${lenderKey}: ${lenderMatches.length} matches`);
            if (lenderMatches.length > 0) {
                matches.push(...lenderMatches);
            }
        }

        console.log('Total matches found:', matches.length);

        // Sort by confidence score and return top 5
        const sortedMatches = matches.sort((a, b) => b.confidence - a.confidence);
        return sortedMatches.slice(0, 5);
    }

    scoreLenderMatch(lenderKey, lenderData, buyerProfile, loanAmount) {
        const matches = [];

        // Check basic eligibility
        if (!this.passesBasicEligibility(lenderData, buyerProfile)) {
            return matches;
        }

        // Score different programs within the lender
        if (lenderData.loan_programs && Array.isArray(lenderData.loan_programs)) {
            lenderData.loan_programs.forEach(program => {
                const score = this.scoreProgramMatch(program, buyerProfile, loanAmount);
                console.log(`  Program ${program.program_type}: confidence ${score.confidence.toFixed(2)}`);
                if (score.confidence >= 0.1) { // Lower threshold to show penalized matches
                    matches.push({
                        lenderName: lenderData.company_name,
                        lenderKey: lenderKey,
                        programName: program.program_type || program.program_name || 'Investment Program',
                        confidence: score.confidence,
                        reason: score.reason,
                        maxLTV: score.maxLTV || 'Varies',
                        minCreditScore: score.minCreditScore || 'Varies',
                        maxLoanAmount: score.maxLoanAmount,
                        website: lenderData.website
                    });
                }
            });
        }

        // Handle structured programs (like AOMS)
        if (lenderData.programs) {
            for (const [programKey, programData] of Object.entries(lenderData.programs)) {
                const score = this.scoreStructuredProgram(programKey, programData, buyerProfile, loanAmount);
                console.log(`  Structured program ${programKey}: confidence ${score.confidence.toFixed(2)}`);
                if (score.confidence >= 0.1) { // Lower threshold to show penalized matches
                    matches.push({
                        lenderName: lenderData.company_name,
                        lenderKey: lenderKey,
                        programName: programData.program_name || programKey,
                        confidence: score.confidence,
                        reason: score.reason,
                        maxLTV: score.maxLTV || 'Varies',
                        minCreditScore: score.minCreditScore || 'Varies',
                        maxLoanAmount: score.maxLoanAmount,
                        website: lenderData.website
                    });
                }
            }
        }

        return matches;
    }

    passesBasicEligibility(lenderData, buyerProfile) {
        // For now, return true for all lenders - let scoring determine fit
        // Investment property lenders should match investment properties better through scoring
        return true;
    }

    scoreProgramMatch(program, buyerProfile, loanAmount) {
        let confidence = 0;
        let reason = '';
        let maxLTV = null;
        let minCreditScore = null;
        let maxLoanAmount = null;

        // Start with lower base confidence for having a program
        confidence = 0.25;
        reason = `${program.program_type || program.program_name || 'Program'} available. `;

        // Handle different program structures
        let creditReqs = null;
        let maxLtvValue = null;
        let maxLoanValue = null;

        // Check if this is a simple program structure
        if (program.credit_requirements) {
            creditReqs = program.credit_requirements;
        }
        if (program.max_ltv) {
            maxLtvValue = program.max_ltv;
        }
        if (program.max_loan_amount) {
            maxLoanValue = program.max_loan_amount;
        }

        // Check if this is a tiered structure (like Arc Home)
        if (program.tiers && Array.isArray(program.tiers)) {
            // Find the best matching tier
            let bestTier = null;
            let bestScore = 0;

            for (const tier of program.tiers) {
                let tierScore = 0;

                // Check credit score
                if (tier.min_credit_score && buyerProfile.creditScore) {
                    const minScore = parseInt(tier.min_credit_score.replace(/\D/g, ''));
                    if (buyerProfile.creditScore >= minScore) {
                        tierScore += 0.3;
                    }
                }

                // Check down payment/LTV
                if (tier.max_ltv && buyerProfile.downPaymentPercent) {
                    const maxLtv = parseInt(tier.max_ltv.replace('%', ''));
                    const requiredDown = 100 - maxLtv;
                    if (buyerProfile.downPaymentPercent >= requiredDown) {
                        tierScore += 0.2;
                    }
                }

                if (tierScore > bestScore) {
                    bestScore = tierScore;
                    bestTier = tier;
                }
            }

            if (bestTier) {
                creditReqs = { min_fico: parseInt(bestTier.min_credit_score?.replace(/\D/g, '') || '0') };
                maxLtvValue = bestTier.max_ltv;
                maxLoanValue = bestTier.max_loan_amount;
            }
        }

        // Credit score matching (40% weight) - now penalizes low scores
        if (buyerProfile.creditScore && creditReqs) {
            const minScore = this.extractMinCreditScore(creditReqs);
            if (minScore) {
                minCreditScore = minScore;
                if (buyerProfile.creditScore >= minScore) {
                    confidence += 0.3;
                    reason += `Credit score meets requirements (${buyerProfile.creditScore} >= ${minScore}). `;
                } else {
                    // Penalize for credit score below minimum instead of giving partial credit
                    const shortfall = (minScore - buyerProfile.creditScore) / minScore;
                    confidence -= 0.3 * shortfall;
                    reason += `Credit score below minimum requirement (${buyerProfile.creditScore} < ${minScore}). `;
                }
            }
        } else if (buyerProfile.creditScore && buyerProfile.creditScore >= 620) {
            confidence += 0.2; // Decent credit score provided
            reason += `Credit score ${buyerProfile.creditScore} provided. `;
        } else if (buyerProfile.creditScore && buyerProfile.creditScore < 620) {
            // Penalize low credit scores even without specific lender minimum
            confidence -= 0.2;
            reason += `Credit score ${buyerProfile.creditScore} is below typical lender minimums. `;
        }

        // Down payment/LTV matching (35% weight)
        if (buyerProfile.downPaymentPercent && maxLtvValue) {
            const maxLtv = typeof maxLtvValue === 'string' ?
                parseInt(maxLtvValue.replace('%', '')) : maxLtvValue;
            maxLTV = maxLtv;
            const requiredDownPayment = 100 - maxLtv;
            if (buyerProfile.downPaymentPercent >= requiredDownPayment) {
                confidence += 0.2;
                reason += `Down payment sufficient (${buyerProfile.downPaymentPercent}% >= ${requiredDownPayment}%). `;
            } else {
                confidence += 0.1 * (buyerProfile.downPaymentPercent / requiredDownPayment);
                reason += `Down payment may be insufficient (${buyerProfile.downPaymentPercent}% < ${requiredDownPayment}%). `;
            }
        } else if (buyerProfile.downPaymentPercent && buyerProfile.downPaymentPercent >= 20) {
            confidence += 0.15; // Good down payment
            reason += `${buyerProfile.downPaymentPercent}% down payment. `;
        }

        // Loan amount matching (15% weight)
        if (loanAmount && maxLoanValue) {
            const maxLoan = typeof maxLoanValue === 'string' ?
                parseFloat(maxLoanValue.replace(/[$,]/g, '')) : maxLoanValue;
            maxLoanAmount = maxLoan;
            if (loanAmount <= maxLoan) {
                confidence += 0.1;
                reason += `Loan amount within limits. `;
            } else {
                confidence += 0.05; // Partial credit if close
                reason += `Loan amount may exceed limits. `;
            }
        }

        // Property type matching (10% weight)
        if (buyerProfile.propertyType && program.property_types) {
            if (program.property_types.includes(buyerProfile.propertyType)) {
                confidence += 0.1;
                reason += `Property type supported. `;
            }
        } else if (program.loan_type && program.loan_type.toLowerCase().includes('investment')) {
            confidence += 0.05;
            reason += `Investment property program. `;
        }

        // Investment experience factor - penalize first-time investors
        if (buyerProfile.investmentExperience && buyerProfile.investmentExperience.toLowerCase().includes('first')) {
            confidence -= 0.15;
            reason += `First-time investor may face additional requirements. `;
        } else if (buyerProfile.investmentExperience && buyerProfile.investmentExperience.toLowerCase().includes('experienced')) {
            confidence += 0.1;
            reason += `Experienced investor. `;
        }

        // Ensure confidence stays within reasonable bounds
        confidence = Math.max(0.05, Math.min(0.95, confidence));

        return { confidence, reason, maxLTV, minCreditScore, maxLoanAmount };
    }

    scoreStructuredProgram(programKey, programData, buyerProfile, loanAmount) {
        // Handle complex nested program structures
        let bestConfidence = 0.5; // Base confidence for having a program
        let bestMatch = {
            confidence: 0.5,
            reason: `${programData.program_name || programKey} available. `,
            maxLTV: null,
            minCreditScore: null,
            maxLoanAmount: null
        };

        // This is a simplified version - real implementation would handle all the nested structures
        if (programData.credit_requirements) {
            for (const [category, requirements] of Object.entries(programData.credit_requirements)) {
                if (category === 'investment_properties' && buyerProfile.propertyType !== 'investment') {
                    continue;
                }

                const score = this.scoreProgramMatch({ 
                    credit_requirements: requirements,
                    program_type: programData.program_name || programKey
                }, buyerProfile, loanAmount);
                if (score.confidence > bestConfidence) {
                    bestConfidence = score.confidence;
                    bestMatch = score;
                }
            }
        }

        return bestMatch;
    }

    extractMinCreditScore(creditRequirements) {
        if (!creditRequirements) return null;

        if (typeof creditRequirements === 'number') {
            return creditRequirements;
        }

        if (typeof creditRequirements === 'string') {
            const numeric = creditRequirements.match(/\d{3}/);
            return numeric ? parseInt(numeric[0], 10) : null;
        }

        if (Array.isArray(creditRequirements)) {
            const scores = creditRequirements
                .map((entry) => this.extractMinCreditScore(entry))
                .filter((score) => score != null);
            return scores.length > 0 ? Math.min(...scores) : null;
        }

        if (typeof creditRequirements === 'object') {
            // Handle direct min_fico or min_credit_score fields
            if (creditRequirements.min_fico) return parseInt(creditRequirements.min_fico, 10);
            if (creditRequirements.min_credit_score) return parseInt(creditRequirements.min_credit_score, 10);

            // Handle nested structures with keys like "min_fico_640"
            const scores = [];
            for (const [key, value] of Object.entries(creditRequirements)) {
                // Check if key contains a FICO score pattern like "min_fico_640"
                const ficoMatch = key.match(/min_fico_(\d+)/);
                if (ficoMatch) {
                    scores.push(parseInt(ficoMatch[1], 10));
                } else {
                    // Recursively check nested objects
                    const nestedScore = this.extractMinCreditScore(value);
                    if (nestedScore != null) {
                        scores.push(nestedScore);
                    }
                }
            }

            return scores.length > 0 ? Math.min(...scores) : null;
        }

        return null;
    }
}

// OpenAI Lender Matching Service
class OpenAIMatchingService {
    constructor() {
        this.apiEndpoint = getApiBaseUrl() + '/api/match-lenders';
    }

    async findLenderMatches(buyerProfile, propertyInsights = null) {
        try {
            console.log('Calling OpenAI matching service with profile:', buyerProfile, 'and property insights:', propertyInsights);

            const requestBody = { buyerProfile };
            if (propertyInsights) {
                requestBody.propertyInsights = propertyInsights;
            }

            const response = await retryApiCall(async () => {
                const res = await fetch(this.apiEndpoint, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(requestBody)
                });

                if (!res.ok) {
                    const errorData = await res.json().catch(() => ({ error: 'Unknown error' }));
                    const error = new Error(errorData.error || `HTTP ${res.status}`);
                    error.status = res.status;
                    throw error;
                }

                return res;
            });

            const data = await response.json();
            console.log('OpenAI Matching Response:', JSON.stringify(data, null, 2));
            console.log('Matches count:', data.matches ? data.matches.length : 0);
            console.log('RequiresMoreInfo:', data.requiresMoreInfo);

            // Return the full response object including requiresMoreInfo, matches, etc.
            return data;

        } catch (error) {
            console.error('Error calling lender matching API:', error);

            // For API errors, fall back to rule-based matching with a warning
            if (error.message.includes('fetch') || error.message.includes('network')) {
                console.warn('API unavailable, falling back to rule-based matching');
                throw new Error('Service temporarily unavailable, using alternative matching method');
            }

            throw error;
        }
    }

    updateApiEndpoint(newEndpoint) {
        this.apiEndpoint = newEndpoint;
    }

}

// Environment-aware API URL helper
function getApiBaseUrl() {
  // Use relative URLs since frontend and backend are now unified
  return ''; // Empty string for relative URLs (same origin)
}

// Utility function for retrying API calls
async function retryApiCall(apiCall, maxRetries = 2, delay = 1000) {
  let lastError;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await apiCall();
    } catch (error) {
      lastError = error;

      // Don't retry certain types of errors
      if (error.message.includes('Service temporarily unavailable') ||
          error.message.includes('Invalid API key') ||
          error.status === 401 || error.status === 403) {
        throw error;
      }

      // Wait before retrying (except on the last attempt)
      if (attempt < maxRetries) {
        await new Promise(resolve => setTimeout(resolve, delay * (attempt + 1)));
      }
    }
  }

  throw lastError;
}

// Utility functions for enhanced interactivity
function addHoverEffects() {
    // Add subtle parallax effect to cards
    document.addEventListener('mousemove', (e) => {
        const cards = document.querySelectorAll('.solution-card');
        
        cards.forEach(card => {
            const rect = card.getBoundingClientRect();
            const centerX = rect.left + rect.width / 2;
            const centerY = rect.top + rect.height / 2;
            
            const deltaX = (e.clientX - centerX) * 0.02;
            const deltaY = (e.clientY - centerY) * 0.02;
            
            card.style.transform = `translate(${deltaX}px, ${deltaY}px) translateY(-4px)`;
        });
    });
}

// Enhanced scroll animations
function observeElements() {
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('visible');
            }
        });
    }, {
        threshold: 0.1,
        rootMargin: '50px'
    });
    
    // Observe elements that need animation
    document.querySelectorAll('.solution-card, .message').forEach(el => {
        observer.observe(el);
    });
}

// Keyboard shortcuts
function addKeyboardShortcuts() {
    document.addEventListener('keydown', (e) => {
        // ESC to go back to landing
        if (e.key === 'Escape') {
            if (document.getElementById('qa-layout').classList.contains('active')) {
                location.reload(); // Simple reset for demo
            }
        }
        
        // Ctrl/Cmd + Enter to submit
        if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
            const chatInput = document.getElementById('chat-input');
            if (document.activeElement === chatInput) {
                document.getElementById('send-btn').click();
            }
        }
    });
}

// Initialize the application
document.addEventListener('DOMContentLoaded', () => {
    window.app = new LenderMatchingApp();
    addHoverEffects();
    observeElements();
    addKeyboardShortcuts();
    
    // Add some dynamic background particles for extra Apple-like polish
    createBackgroundParticles();
});

// Background particles effect
function createBackgroundParticles() {
    const canvas = document.createElement('canvas');
    canvas.style.position = 'fixed';
    canvas.style.top = '0';
    canvas.style.left = '0';
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    canvas.style.pointerEvents = 'none';
    canvas.style.zIndex = '-1';
    canvas.style.opacity = '0.3';
    
    document.body.appendChild(canvas);
    
    const ctx = canvas.getContext('2d');
    let particles = [];
    
    function resizeCanvas() {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
    }
    
    function createParticle() {
        return {
            x: Math.random() * canvas.width,
            y: Math.random() * canvas.height,
            size: Math.random() * 2 + 1,
            speedX: (Math.random() - 0.5) * 0.5,
            speedY: (Math.random() - 0.5) * 0.5,
            opacity: Math.random() * 0.5 + 0.2
        };
    }
    
    function animate() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        particles.forEach(particle => {
            particle.x += particle.speedX;
            particle.y += particle.speedY;
            
            // Wrap around edges
            if (particle.x > canvas.width) particle.x = 0;
            if (particle.x < 0) particle.x = canvas.width;
            if (particle.y > canvas.height) particle.y = 0;
            if (particle.y < 0) particle.y = canvas.height;
            
            // Draw particle
            ctx.beginPath();
            ctx.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(139, 92, 246, ${particle.opacity})`;
            ctx.fill();
        });
        
        requestAnimationFrame(animate);
    }
    
    // Initialize
    resizeCanvas();
    
    // Create particles
    for (let i = 0; i < 50; i++) {
        particles.push(createParticle());
    }
    
    animate();
    
    // Handle resize
    window.addEventListener('resize', resizeCanvas);
}