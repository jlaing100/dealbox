// Real Estate Lender Matching Platform
const DEFAULT_API_BASE_URL = 'https://dealdesk-mvp.vercel.app';
const resolvedBaseUrl = (typeof window !== 'undefined' && window.DEALDESK_API_BASE_URL !== undefined)
    ? window.DEALDESK_API_BASE_URL
    : DEFAULT_API_BASE_URL;
const API_BASE_URL = (resolvedBaseUrl || DEFAULT_API_BASE_URL).replace(/\/$/, '');

function buildApiUrl(path) {
    const normalizedPath = path.startsWith('/') ? path : `/${path}`;
    return `${API_BASE_URL}${normalizedPath}`;
}

const API_ENDPOINTS = {
    chat: buildApiUrl('/api/chat-new'),
    match: buildApiUrl('/api/match-lenders'),
    propertyInsights: buildApiUrl('/api/remine/property-insights')
};

const DEFAULT_API_TIMEOUT = 25000;

async function fetchWithTimeout(resource, options = {}, timeout = DEFAULT_API_TIMEOUT) {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeout);

    try {
        const response = await fetch(resource, {
            ...options,
            signal: controller.signal
        });
        return response;
    } finally {
        clearTimeout(id);
    }
}

function formatPercentage(value) {
    if (value === null || value === undefined) return null;
    if (typeof value === 'number' && !isNaN(value)) {
        return `${value}%`;
    }
    const numeric = parseFloat(String(value).replace(/[^\d.]/g, ''));
    if (isNaN(numeric)) return null;
    return `${numeric}%`;
}

function formatCurrency(value) {
    if (value === null || value === undefined) return null;
    const numeric = typeof value === 'number'
        ? value
        : parseFloat(String(value).replace(/[^0-9.]/g, ''));
    if (isNaN(numeric)) return null;
    return `$${Math.round(numeric).toLocaleString()}`;
}

class LenderMatchingApp {
    constructor() {
        this.lenderService = new LenderService();
        this.llmService = new OpenAIMatchingService();
        this.chatService = new ChatService();
        this.currentMatches = null; // Store current lender matches for chat context
        this.propertyInsights = null;
        this.hasEnteredChat = false;
        this.isSubmittingForm = false;
        this.fieldLabels = {
            propertyValue: 'Property Value',
            propertyType: 'Property Type',
            propertyLocation: 'Property Location',
            downPaymentPercent: 'Down Payment Percentage',
            creditScore: 'Credit Score',
            propertyVacant: 'Property Vacancy',
            investmentExperience: 'Investment Experience'
        };
        this.fieldIdToKeyMap = {
            'property-value': 'propertyValue',
            'property-type': 'propertyType',
            'property-location': 'propertyLocation',
            'down-payment-percent': 'downPaymentPercent',
            'credit-score': 'creditScore',
            'property-vacant': 'propertyVacant',
            'investment-experience': 'investmentExperience'
        };
        this.requiredFieldKeys = ['propertyValue', 'propertyType', 'downPaymentPercent', 'creditScore', 'investmentExperience'];
        this.init();
    }
    
    async init() {
        this.bindEvents();
        this.restoreInteractiveFields();
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
                this.handleFormSubmission();
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

    restoreInteractiveFields() {
        const interactiveFields = document.querySelectorAll('#investor-form input, #investor-form select, #investor-form textarea');
        interactiveFields.forEach(field => {
            if (field.disabled) {
                field.disabled = false;
            }
            if (field.readOnly) {
                field.readOnly = false;
            }
            field.classList.remove('error');
            field.style.borderColor = '';
            field.style.boxShadow = '';
            const group = field.closest('.form-group');
            if (group) {
                group.classList.remove('error');
            }
        });
    }

    bindChatEvents() {
        this.chatService.refreshDomReferences();
        const chatInput = this.chatService.chatInputEl || document.getElementById('chat-input');
        const sendBtn = this.chatService.sendBtnEl || document.getElementById('send-btn');
        if (!chatInput || !sendBtn) {
            console.warn('Chat elements missing; chat events not bound.');
            return;
        }

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
        this.chatService.refreshDomReferences();
        const chatInput = this.chatService.chatInputEl || document.getElementById('chat-input');
        const sendBtn = this.chatService.sendBtnEl || document.getElementById('send-btn');
        if (!chatInput || !sendBtn) {
            console.warn('Chat controls missing; cannot send message.');
            return;
        }
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
    
    animateEntrance() {
        // Animate landing page entrance
        setTimeout(() => {
            document.querySelector('.landing-page').classList.add('active');
        }, 300);
    }
    
    validateField(input) {
        const rawValue = input.value;
        const value = typeof rawValue === 'string' ? rawValue.trim() : rawValue;
        let isValid = true;
        const formGroup = input.closest('.form-group');

        // Remove previous error styling
        input.classList.remove('error');
        if (formGroup) {
            formGroup.classList.remove('error');
        }

        // Required field validation
        if (input.required && (value === '' || value === null || value === undefined)) {
            isValid = false;
        }

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

        if (input.tagName === 'SELECT' && input.required && !value) {
            isValid = false;
        }

        if (!isValid) {
            input.classList.add('error');
            if (formGroup) {
                formGroup.classList.add('error');
            }
            input.style.borderColor = '#ef4444';
            input.style.boxShadow = '0 0 15px rgba(239, 68, 68, 0.5)';
        } else {
            input.style.borderColor = '';
            input.style.boxShadow = '';
        }

        return isValid;
    }

    async handleFormSubmission() {
        // Prevent multiple simultaneous submissions
        if (this.isSubmittingForm) {
            console.log('Form already being submitted, skipping...');
            return;
        }
        this.isSubmittingForm = true;

        const form = document.getElementById('investor-form');
        const submitBtn = document.getElementById('find-lenders-btn');

        // Validate all fields
        const formInputs = form.querySelectorAll('input, select, textarea');
        let allValid = true;
        const missingFieldKeys = [];

        formInputs.forEach(input => {
            const fieldIsValid = this.validateField(input);
            if (!fieldIsValid) {
                allValid = false;
                if (input.required) {
                    const normalizedValue = (input.value || '').toString().trim();
                    if (!normalizedValue) {
                        const fieldKey = this.fieldIdToKeyMap[input.id] || input.name || input.id;
                        if (!missingFieldKeys.includes(fieldKey)) {
                            missingFieldKeys.push(fieldKey);
                        }
                    }
                }
            }
        });

        if (!allValid) {
            if (missingFieldKeys.length > 0) {
                this.showFormError(`Please complete the following before continuing: ${this.formatFieldList(missingFieldKeys)}.`);
            } else {
                this.showFormError('Please check your input values and try again.');
            }
            return;
        }

        // Collect form data
        const formData = this.collectFormData();
        this.lastSubmittedProfile = formData;
        this.hasEnteredChat = false;

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
            const requiresMoreInfo = Boolean(result.requiresMoreInfo);
            const matches = result.matches || [];
            const missingFieldsFromApi = Array.isArray(result.missingFields) ? result.missingFields : [];

            if (requiresMoreInfo && missingFieldsFromApi.length > 0) {
                this.showFormError(`Add ${this.formatFieldList(missingFieldsFromApi)} to unlock tailored lender matches.`);
            }

            // Display results
            this.displayResults(matches, requiresMoreInfo, missingFieldsFromApi);

            // If help field has content, send it as initial chat message
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
            this.isSubmittingForm = false;
        }
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
        
        return {
            propertyValue: parseFloat(document.getElementById('property-value').value) || null,
            propertyType: document.getElementById('property-type').value || null,
            propertyLocation: document.getElementById('property-location').value.trim() || null,
            downPaymentPercent: downPaymentPercent,
            propertyVacant: document.getElementById('property-vacant').value || null,
            currentRent: parseFloat(document.getElementById('current-rent').value) || null,
            creditScore: parseInt(document.getElementById('credit-score').value) || null,
            investmentExperience: document.getElementById('investment-experience').value || null,
            helpQuery: document.getElementById('help-field').value.trim() || null,
        };
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
                requiresMoreInfo: false,
                missingFields: this.getMissingRequiredFields(buyerProfile)
            };
        }
    }

    async fetchPropertyInsights(city, state, propertyValue, propertyType = null) {
        const fallbackFormData = this.collectFormData();
        try {
            const response = await fetchWithTimeout(API_ENDPOINTS.propertyInsights, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    city,
                    state,
                    propertyValue: parseFloat(propertyValue),
                    propertyType,
                    downPaymentPercent: fallbackFormData.downPaymentPercent ?? null,
                    currentRent: fallbackFormData.currentRent ?? null
                })
            });

            if (!response.ok) {
                throw new Error(`Property insights error: ${response.status}`);
            }

            const data = await response.json();
            return data.insights; // Return just the insights object
        } catch (error) {
            if (error.name === 'AbortError') {
                throw new Error('Property insights request timed out.');
            }
            console.error('Error fetching property insights:', error);
            throw error;
        }
    }

    resetChatForNewSearch() {
        if (this.chatService && typeof this.chatService.refreshDomReferences === 'function') {
            this.chatService.refreshDomReferences();
        }
        // Clear chat messages container
        const chatMessages = document.getElementById('chat-messages');
        if (chatMessages) {
            chatMessages.innerHTML = '';
        }

        // Clear conversation history in ChatService
        this.chatService.clearHistory();

        // Enable chat input
        const chatInput = document.getElementById('chat-input');
        if (chatInput) {
            chatInput.disabled = false;
            chatInput.focus();
        }
    }

    displayResults(matches, requiresMoreInfo = false, missingFields = [], isChatUpdate = false) {
        // Store matches for chat context
        this.currentMatches = matches;

        // Reset chat state for new search (only on initial form submission, not chat updates)
        if (!this.hasEnteredChat && !isChatUpdate) {
            this.resetChatForNewSearch();
            this.hasEnteredChat = true;
        }

        // Only transition UI on initial form submission, not on chat updates
        if (!isChatUpdate) {
            // Transition from landing page to results view
            const landingPage = document.getElementById('landing-page');
            const qaLayout = document.getElementById('qa-layout');

            // Scroll to top for better UX
            window.scrollTo({ top: 0, behavior: 'smooth' });

            // Hide landing page and show results layout immediately
            landingPage.classList.remove('active');
            landingPage.style.display = 'none';

            qaLayout.style.display = 'grid';
            qaLayout.classList.add('active');
        }

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
                this.showIncompleteInfoCard(missingFields);
            } else {
                this.showLenderCards(matches);
            }
        }, isChatUpdate ? 100 : 500);

        // Add initial chat suggestions only on initial form submission, not on chat updates
        if (!isChatUpdate) {
            setTimeout(() => {
                this.addInitialChatSuggestions(matches, requiresMoreInfo, missingFields);
            }, 1000);
        }
    }

    addInitialChatSuggestions(matches, requiresMoreInfo = false, missingFields = []) {
        let welcomeMessage;

        if (requiresMoreInfo) {
            const missingList = missingFields.length > 0 ? this.formatFieldList(missingFields) : 'the required deal details';
            welcomeMessage = `I've received your initial information, but I need more details (${missingList}) to provide lender recommendations. Please share the missing information with me so I can help you find the best lenders for your situation.`;
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
    
    showLenderCards(matches) {
        const solutionCards = document.getElementById('solution-cards');
        const solutionsCount = document.getElementById('solutions-count');

        // Clear existing cards
        solutionCards.innerHTML = '';

        const normalizedMatches = Array.isArray(matches)
            ? matches.map(match => ({
                ...match,
                isMatch: match.isMatch ?? (typeof match.confidence === 'number' ? match.confidence >= 0.6 : false)
            }))
            : [];

        // Update count
        const matchCount = normalizedMatches.filter(m => m.isMatch).length;
        const totalCount = normalizedMatches.length;
        let countText;

        if (totalCount === 0) {
            countText = 'No lenders evaluated';
        } else if (matchCount === 0) {
            countText = `${totalCount} lender${totalCount > 1 ? 's' : ''} evaluated`;
        } else {
            countText = `${matchCount} match${matchCount > 1 ? 'es' : ''} found (${totalCount} total)`;
        }
        solutionsCount.textContent = countText;

        // Sort matches: matches first (by confidence), then non-matches (by name)
        if (normalizedMatches.length > 0) {
            const sortedMatches = normalizedMatches.sort((a, b) => {
                if (a.isMatch && !b.isMatch) return -1;
                if (!a.isMatch && b.isMatch) return 1;
                if (a.isMatch && b.isMatch) return b.confidence - a.confidence;
                return a.lenderName.localeCompare(b.lenderName);
            });

            // Create and animate cards
            sortedMatches.forEach((match, index) => {
                setTimeout(() => {
                    const cardElement = this.createLenderCard(match);
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
    
    createLenderCard(lenderMatch) {
        const cardDiv = document.createElement('div');
        const isMatch = lenderMatch.isMatch ?? (lenderMatch.confidence >= 0.6);
        cardDiv.className = `solution-card ${isMatch ? 'match' : 'no-match'}`;

        const confidence = typeof lenderMatch.confidence === 'number' ? lenderMatch.confidence : 0.5;
        const scoreBadge = confidence > 0.8 ? 'excellent' :
                          confidence > 0.6 ? 'good' : 'fair';

        const matchText = isMatch ?
            `${Math.round(confidence * 100)}% match` :
            'Not a match';
        
        const badgeClass = isMatch ? scoreBadge : 'no-match';
        const formattedMaxLtv = formatPercentage(lenderMatch.maxLTV);
        const formattedMaxLoan = formatCurrency(lenderMatch.maxLoanAmount);
        const summaryText = lenderMatch.matchSummary || lenderMatch.reason || 'Program available for review.';
        const nonMatchText = lenderMatch.nonMatchReason || summaryText;

        // Create contact buttons HTML
        const contactButtons = [];
        if (lenderMatch.contact_phone) {
            const sanitizedPhone = lenderMatch.contact_phone.replace(/\s+/g, '');
            contactButtons.push(`<a class="contact-btn phone-btn" href="tel:${sanitizedPhone}">
                📞 Call
            </a>`);
        }
        const normalizedWebsite = this.normalizeUrl(lenderMatch.website);
        if (normalizedWebsite) {
            contactButtons.push(`<a class="contact-btn website-btn" href="${normalizedWebsite}" target="_blank" rel="noopener noreferrer">
                🌐 Website
            </a>`);
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

        cardDiv.innerHTML = `
            <div class="lender-header">
                <h3 class="card-title">${lenderMatch.lenderName}</h3>
                <div class="confidence-badge ${badgeClass}">
                    ${matchText}
                </div>
            </div>
            <p class="card-subtitle">${lenderMatch.programName || lenderMatch.lenderName}</p>
            <div class="match-reason">
                <p>${isMatch ? summaryText : nonMatchText}</p>
            </div>
            <div class="lender-details">
                ${formattedMaxLtv ? `
                <div class="detail-row">
                    <span class="detail-label">Max LTV:</span>
                    <span class="detail-value">${formattedMaxLtv}</span>
                </div>
                ` : ''}
                ${lenderMatch.minCreditScore ? `
                <div class="detail-row">
                    <span class="detail-label">Min Credit Score:</span>
                    <span class="detail-value">${lenderMatch.minCreditScore}</span>
                </div>
                ` : ''}
                ${formattedMaxLoan ? `
                <div class="detail-row">
                    <span class="detail-label">Max Loan:</span>
                    <span class="detail-value">${formattedMaxLoan}</span>
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

    normalizeUrl(url) {
        if (!url || typeof url !== 'string') return null;
        const trimmed = url.trim();
        if (!trimmed) return null;
        if (/^https?:\/\//i.test(trimmed)) {
            return trimmed;
        }
        return `https://${trimmed.replace(/^\/+/, '')}`;
    }

    showIncompleteInfoCard(missingFields = []) {
        const solutionCards = document.getElementById('solution-cards');
        const solutionsCount = document.getElementById('solutions-count');

        // Clear existing cards
        solutionCards.innerHTML = '';

        // Update count
        solutionsCount.textContent = 'Information needed';

        // Create and add incomplete info card
        const cardElement = this.createIncompleteInfoCard(missingFields);
        solutionCards.appendChild(cardElement);

        // Trigger animation
        requestAnimationFrame(() => {
            cardElement.classList.add('visible');
        });
    }

    createIncompleteInfoCard(missingFields = []) {
        const cardDiv = document.createElement('div');
        cardDiv.className = 'solution-card incomplete-info';

        const fieldsToList = (missingFields.length > 0 ? missingFields : this.requiredFieldKeys)
            .map(field => `<li>${this.formatFieldLabel(field)}</li>`)
            .join('');

        cardDiv.innerHTML = `
            <div class="incomplete-info-content">
                <h3 class="card-title">More Information Needed</h3>
                <p class="card-subtitle">To provide personalized lender recommendations, I need additional details about your situation.</p>
                <div class="info-needed">
                    <p>Please provide this information through the Deal Analysis chatbot:</p>
                    <ul class="required-info-list">
                        ${fieldsToList}
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

    formatFieldLabel(fieldKey = '') {
        if (!fieldKey) return 'Field';
        if (this.fieldLabels[fieldKey]) return this.fieldLabels[fieldKey];
        if (this.fieldLabels[this.fieldIdToKeyMap[fieldKey]]) {
            return this.fieldLabels[this.fieldIdToKeyMap[fieldKey]];
        }
        const normalizedKey = fieldKey.replace(/[-_\s]/g, '');
        if (this.fieldLabels[normalizedKey]) return this.fieldLabels[normalizedKey];
        return this.toTitleCase(fieldKey);
    }

    formatFieldList(fields = []) {
        return fields.map(field => this.formatFieldLabel(field)).join(', ');
    }

    toTitleCase(text = '') {
        return text
            .replace(/([A-Z])/g, ' $1')
            .replace(/[_-]/g, ' ')
            .replace(/\s+/g, ' ')
            .trim()
            .replace(/\w\S*/g, word => word.charAt(0).toUpperCase() + word.slice(1));
    }

    getMissingRequiredFields(profile = {}) {
        const missing = [];
        if (!profile.propertyValue) missing.push('propertyValue');
        if (!profile.propertyType) missing.push('propertyType');
        if (profile.downPaymentPercent == null) missing.push('downPaymentPercent');
        if (!profile.creditScore) missing.push('creditScore');
        if (!profile.investmentExperience) missing.push('investmentExperience');
        return missing;
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
        this.apiEndpoint = API_ENDPOINTS.chat;
        this.isTyping = false;
        this.chatMessagesEl = null;
        this.chatInputEl = null;
        this.sendBtnEl = null;
        this.refreshDomReferences();
    }

    refreshDomReferences() {
        this.chatMessagesEl = document.getElementById('chat-messages');
        this.chatInputEl = document.getElementById('chat-input');
        this.sendBtnEl = document.getElementById('send-btn');
    }

    ensureChatElements() {
        if (!this.chatMessagesEl || !document.body.contains(this.chatMessagesEl)) {
            this.refreshDomReferences();
        }
        return this.chatMessagesEl;
    }

    async sendMessage(message, userContext = null, propertyInsights = null) {
        if (!message.trim()) return;

        // Prevent multiple simultaneous requests
        if (this.isTyping) {
            return;
        }

        try {
            this.ensureChatElements();
            // Add user message to UI
            this.displayMessage(message, 'user');

            // Show typing indicator
            this.showTypingIndicator();

            // Prepare request payload
            const payload = {
                message: message.trim(),
                userContext: userContext || this.getUserContext(),
                conversationHistory: this.conversationHistory
            };

            // Include property insights if available
            if (propertyInsights) {
                payload.propertyInsights = propertyInsights;
            } else if (window.app && window.app.propertyInsights) {
                payload.propertyInsights = window.app.propertyInsights;
            }

            // Make API call
            const response = await fetchWithTimeout(this.apiEndpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(payload)
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

                if ((isAskingForRecommendations || parameterChanges.hasChanges) && window.app && window.app.currentMatches) {
                    // User is asking for recommendations or changing parameters, get new lender matches
                    try {
                        let formData = window.app.collectFormData();

                        // Apply any detected parameter changes
                        if (parameterChanges.hasChanges) {
                            formData = this.applyParameterChanges(formData, parameterChanges);
                        }

                        const result = await window.app.findMatchingLenders(formData);
                        const newMatches = result.matches || [];
                        const requiresMoreInfo = result.requiresMoreInfo || false;

                        if (requiresMoreInfo) {
                            // Still need more info, show the incomplete info card
                            window.app.displayResults([], true, result.missingFields || [], true);
                        } else if (newMatches && newMatches.length > 0) {
                            // Got new matches, update display
                            window.app.currentMatches = newMatches;
                            window.app.showLenderCards(newMatches);
                            // Remove grayed-out state if it exists
                            const solutionsColumn = document.querySelector('.solutions-column');
                            if (solutionsColumn) {
                                solutionsColumn.classList.remove('disabled');
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
            const errorMessage = error.name === 'AbortError'
                ? 'Sorry, the chat request took too long. Please try again.'
                : `Sorry, I'm having trouble connecting right now. Please try again later. Error: ${error.message}`;
            this.displayMessage(errorMessage, 'bot', true);
            throw error;
        }
    }

    displayMessage(message, sender, isError = false) {
        const chatMessages = this.ensureChatElements();
        if (!chatMessages) {
            console.warn('Chat container missing; cannot render message.');
            return;
        }
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
        const chatMessages = this.ensureChatElements();
        if (!chatMessages) return;
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

        return {
            formData: formData,
            lenderMatches: lenderMatches,
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
    }

    updateApiEndpoint(newEndpoint) {
        this.apiEndpoint = newEndpoint;
    }

    detectParameterChanges(message) {
        const lowerMessage = message.toLowerCase();
        const changes = {
            hasChanges: false,
            creditScore: null,
            downPaymentPercent: null,
            propertyValue: null,
            propertyType: null,
            investmentExperience: null
        };

        // Detect credit score changes
        const creditPatterns = [
            /credit score.*?(\d{3})/i,
            /credit.*?(\d{3})/i,
            /score.*?(\d{3})/i,
            /(\d{3}).*?credit/i,
            /actually.*?(\d{3})/i,
            /my.*?credit.*?(\d{3})/i
        ];

        for (const pattern of creditPatterns) {
            const match = message.match(pattern);
            if (match && match[1]) {
                const score = parseInt(match[1]);
                if (score >= 300 && score <= 850) {
                    changes.creditScore = score;
                    changes.hasChanges = true;
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
            /\$(\d+(?:,\d{3})*(?:\.\d{2})?).*?property/i,
            /worth.*?\$(\d+(?:,\d{3})*(?:\.\d{2})?)/i
        ];

        for (const pattern of propertyValuePatterns) {
            const match = message.match(pattern);
            if (match && match[1]) {
                const valueStr = match[1].replace(/,/g, '');
                const value = parseFloat(valueStr);
                if (value >= 50000 && value <= 10000000) {
                    changes.propertyValue = value;
                    changes.hasChanges = true;
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

        return updatedFormData;
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

        // Credit score matching (40% weight) - now penalizes low scores
        if (buyerProfile.creditScore && program.credit_requirements) {
            // This is simplified - real implementation would parse complex credit requirements
            const minScore = this.extractMinCreditScore(program.credit_requirements);
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
        if (buyerProfile.downPaymentPercent && program.max_ltv) {
            maxLTV = program.max_ltv;
            const requiredDownPayment = 100 - program.max_ltv;
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
        if (loanAmount && program.max_loan_amount) {
            maxLoanAmount = program.max_loan_amount;
            if (loanAmount <= program.max_loan_amount) {
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
        } else if (program.purpose && program.purpose.toLowerCase().includes('investment')) {
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
        this.apiEndpoint = API_ENDPOINTS.match;
    }

    async findLenderMatches(buyerProfile, propertyInsights = null) {
        try {
            console.log('Calling OpenAI matching service with profile:', buyerProfile, 'and property insights:', propertyInsights);

            const requestBody = { buyerProfile };
            if (propertyInsights) {
                requestBody.propertyInsights = propertyInsights;
            }

            const response = await fetchWithTimeout(this.apiEndpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(requestBody)
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || `HTTP ${response.status}`);
            }

            const data = await response.json();
            console.log('OpenAI Matching Response:', data);

            // Return the full response object including requiresMoreInfo, matches, etc.
            return data;

        } catch (error) {
            if (error.name === 'AbortError') {
                console.error('OpenAI matching request timed out');
                throw new Error('Matching request timed out. Please try again.');
            }
            console.error('Error calling OpenAI matching API:', error);
            throw error;
        }
    }

    updateApiEndpoint(newEndpoint) {
        this.apiEndpoint = newEndpoint;
    }

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