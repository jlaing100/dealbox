const fs = require('fs');
const path = require('path');

const MATCH_CONFIDENCE_THRESHOLD = 0.6;

class LenderMatcher {
  constructor(databasePath = null) {
    this.lenderDatabase = null;
    this.databasePath = databasePath || path.join(__dirname, '../lender_details/Comprehensive/comprehensive_lender_database_NORMALIZED.json');

    // Load database on instantiation
    this.loadDatabase();
  }

  loadDatabase() {
    try {
      const databaseContent = fs.readFileSync(this.databasePath, 'utf8');
      this.lenderDatabase = JSON.parse(databaseContent);
      console.log('✅ Lender database loaded successfully from:', this.databasePath);
    } catch (error) {
      console.error('❌ Error loading lender database:', error);
      throw new Error('Failed to load lender database');
    }
  }

  findTopMatches(buyerProfile = {}, limit = 5) {
    const normalizedProfile = this.normalizeProfile(buyerProfile);
    const matches = this.findMatchesByRules(normalizedProfile);

    return matches
      .map((match) => ({
        ...match,
        isMatch: match.confidence >= MATCH_CONFIDENCE_THRESHOLD,
        matchSummary: match.reason?.trim() || 'Program available for review.',
        nonMatchReason:
          match.confidence >= MATCH_CONFIDENCE_THRESHOLD
            ? null
            : (match.reason?.trim() || 'Program may require stronger qualifications.'),
      }))
      .slice(0, limit);
  }

  normalizeProfile(profile) {
    const safeNumber = (value) => (typeof value === 'number' && !Number.isNaN(value) ? value : null);
    const sanitizeString = (value) =>
      typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;

    return {
      propertyValue: safeNumber(
        typeof profile.propertyValue === 'string'
          ? Number(profile.propertyValue.replace(/[^0-9.]/g, ''))
          : profile.propertyValue,
      ),
      propertyType: sanitizeString(profile.propertyType),
      propertyLocation: sanitizeString(profile.propertyLocation),
      downPaymentPercent: safeNumber(profile.downPaymentPercent),
      propertyVacant: sanitizeString(profile.propertyVacant),
      currentRent: safeNumber(profile.currentRent),
      creditScore: safeNumber(profile.creditScore),
      investmentExperience: sanitizeString(profile.investmentExperience),
      helpQuery: sanitizeString(profile.helpQuery),
    };
  }

  findMatchesByRules(buyerProfile) {
    if (!this.lenderDatabase || !this.lenderDatabase.lenders) {
      throw new Error('Lender database not loaded');
    }

    const matches = [];
    const lenders = this.lenderDatabase.lenders;

    const loanAmount =
      buyerProfile.propertyValue && buyerProfile.downPaymentPercent != null
        ? buyerProfile.propertyValue * (1 - buyerProfile.downPaymentPercent / 100)
        : null;

    for (const [lenderKey, lenderData] of Object.entries(lenders)) {
      const lenderMatches = this.scoreLenderMatch(lenderKey, lenderData, buyerProfile, loanAmount);
      if (lenderMatches.length > 0) {
        matches.push(...lenderMatches);
      }
    }

    return matches.sort((a, b) => b.confidence - a.confidence);
  }

  scoreLenderMatch(lenderKey, lenderData, buyerProfile, loanAmount) {
    const matches = [];

    if (!this.passesBasicEligibility(lenderData, buyerProfile)) {
      return matches;
    }

    if (Array.isArray(lenderData.loan_programs)) {
      lenderData.loan_programs.forEach((program) => {
        const score = this.scoreProgramMatch(program, buyerProfile, loanAmount);
        if (score.confidence >= 0.1) { // Lower threshold to show penalized matches
          matches.push(
            this.buildMatchObject(lenderKey, lenderData, program.program_type || program.program_name, score),
          );
        }
      });
    }

    if (lenderData.programs && typeof lenderData.programs === 'object') {
      Object.entries(lenderData.programs).forEach(([programKey, programData]) => {
        const score = this.scoreStructuredProgram(programKey, programData, buyerProfile, loanAmount);
        if (score.confidence >= 0.1) { // Lower threshold to show penalized matches
          matches.push(this.buildMatchObject(lenderKey, lenderData, programData.program_name || programKey, score));
        }
      });
    }

    if (matches.length === 0) {
      // Start with lower default confidence for lenders that don't match
      let defaultConfidence = 0.25;
      let defaultReason = `${lenderData.company_name} offers programs worth reviewing once more details are provided.`;

      // Apply investment experience penalty even to default matches
      if (buyerProfile.investmentExperience && buyerProfile.investmentExperience.toLowerCase().includes('first')) {
        defaultConfidence -= 0.15;
        defaultReason += ` First-time investor may face additional requirements.`;
      }

      // Ensure minimum confidence
      defaultConfidence = Math.max(0.05, defaultConfidence);

      matches.push(
        this.buildMatchObject(lenderKey, lenderData, lenderData.company_name, {
          confidence: defaultConfidence,
          reason: defaultReason,
          maxLTV: null,
          minCreditScore: null,
          maxLoanAmount: null,
        }),
      );
    }

    return matches;
  }

  passesBasicEligibility() {
    return true;
  }

  buildMatchObject(lenderKey, lenderData, programName, score) {
    return {
      lenderName: lenderData.company_name || lenderKey,
      lenderKey,
      programName: programName || lenderData.company_name,
      confidence: Number(score.confidence.toFixed(2)),
      reason: score.reason || 'Program available.',
      maxLTV: score.maxLTV,
      minCreditScore: score.minCreditScore,
      maxLoanAmount: score.maxLoanAmount,
      website: lenderData.website || null,
      contact_phone: lenderData.contact_phone || null,
      department_contacts: lenderData.department_contacts || null,
    };
  }

  scoreProgramMatch(program, buyerProfile, loanAmount) {
    let confidence = 0.25;
    let reason = `${program.program_type || program.program_name || 'Program'} available. `;
    let maxLTV = this.parsePercent(program.max_ltv);
    let minCreditScore = this.extractMinCreditScore(program.credit_requirements);
    let maxLoanAmount = this.parseCurrency(program.max_loan_amount);

    if (buyerProfile.creditScore && minCreditScore) {
      if (buyerProfile.creditScore >= minCreditScore) {
        confidence += 0.3;
        reason += `Credit score ${buyerProfile.creditScore} meets ${minCreditScore}. `;
      } else {
        // Penalize for credit score below minimum instead of giving partial credit
        const shortfall = (minCreditScore - buyerProfile.creditScore) / minCreditScore;
        confidence -= 0.3 * shortfall;
        reason += `Credit score below minimum requirement (${buyerProfile.creditScore} < ${minCreditScore}). `;
      }
    } else if (buyerProfile.creditScore && buyerProfile.creditScore >= 620) {
      confidence += 0.2;
      reason += `Documented credit score of ${buyerProfile.creditScore}. `;
    } else if (buyerProfile.creditScore && buyerProfile.creditScore < 620) {
      // Penalize low credit scores even without specific lender minimum
      confidence -= 0.2;
      reason += `Credit score ${buyerProfile.creditScore} is below typical lender minimums. `;
    }

    if (buyerProfile.downPaymentPercent && maxLTV != null) {
      const requiredDownPayment = 100 - maxLTV;
      if (buyerProfile.downPaymentPercent >= requiredDownPayment) {
        confidence += 0.2;
        reason += `Down payment of ${buyerProfile.downPaymentPercent}% satisfies ${requiredDownPayment}%+. `;
      } else {
        confidence += 0.1 * (buyerProfile.downPaymentPercent / requiredDownPayment);
        reason += `Consider increasing down payment to ${requiredDownPayment}%+. `;
      }
    } else if (buyerProfile.downPaymentPercent && buyerProfile.downPaymentPercent >= 20) {
      confidence += 0.15;
      reason += `${buyerProfile.downPaymentPercent}% down payment improves terms. `;
    }

    if (loanAmount && maxLoanAmount) {
      if (loanAmount <= maxLoanAmount) {
        confidence += 0.1;
        reason += `Loan amount ~$${Math.round(loanAmount).toLocaleString()} within program limits. `;
      } else {
        confidence += 0.05;
        reason += `Loan amount may exceed program cap of $${maxLoanAmount.toLocaleString()}. `;
      }
    }

    if (buyerProfile.propertyType && Array.isArray(program.property_types)) {
      const normalizedPropertyList = program.property_types.map((type) => type.toLowerCase());
      if (normalizedPropertyList.some((type) => type.includes(this.normalizePropertyType(buyerProfile.propertyType)))) {
        confidence += 0.1;
        reason += `Property type supported (${buyerProfile.propertyType}). `;
      }
    } else if (program.purpose && typeof program.purpose === 'string') {
      if (program.purpose.toLowerCase().includes('investment')) {
        confidence += 0.05;
        reason += 'Designed for investment properties. ';
      }
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

    return { confidence: Math.min(confidence, 0.99), reason, maxLTV, minCreditScore, maxLoanAmount };
  }

  scoreStructuredProgram(programKey, programData, buyerProfile, loanAmount) {
    let bestScore = {
      confidence: 0.05, // Start with very low confidence
      reason: `${programData.program_name || programKey} available. `,
      maxLTV: null,
      minCreditScore: null,
      maxLoanAmount: null,
    };

    if (programData.credit_requirements) {
      // Determine which credit requirements to use based on property type
      const isInvestmentProperty = (buyerProfile.currentRent && buyerProfile.currentRent > 0) ||
        (buyerProfile.propertyType &&
         (buyerProfile.propertyType.toLowerCase().includes('investment') ||
          buyerProfile.propertyType.toLowerCase().includes('rental')));

      let selectedRequirements = null;

      if (isInvestmentProperty && programData.credit_requirements.investment_properties) {
        // Use investment property requirements
        selectedRequirements = programData.credit_requirements.investment_properties;
      } else if (programData.credit_requirements.primary_residence) {
        // Use primary residence requirements
        selectedRequirements = programData.credit_requirements.primary_residence;
      } else {
        // Fallback to any available requirements
        const allRequirements = Object.values(programData.credit_requirements);
        if (allRequirements.length > 0) {
          selectedRequirements = allRequirements[0];
        }
      }

      if (selectedRequirements) {
        // Determine the correct max loan amount based on property type
        let maxLoanAmount = null;
        if (programData.loan_amounts) {
          if (isInvestmentProperty && programData.loan_amounts.investment_properties) {
            maxLoanAmount = this.parseCurrency(programData.loan_amounts.investment_properties.max);
          } else if (programData.loan_amounts.primary_residence) {
            maxLoanAmount = this.parseCurrency(programData.loan_amounts.primary_residence.max);
          }
        }
        if (!maxLoanAmount) {
          maxLoanAmount = this.findMaxLoanAmount(programData);
        }

        const score = this.scoreProgramMatch(
          {
            program_type: programData.program_name || programKey,
            credit_requirements: selectedRequirements,
            max_ltv: this.findMaxLtv(selectedRequirements),
            max_loan_amount: maxLoanAmount,
            property_types: programData.property_types,
            purpose: programData.specialty,
          },
          buyerProfile,
          loanAmount,
        );

        bestScore = score; // Use this score directly
      }
    }

    return bestScore;
  }

  findMaxLtv(requirements) {
    if (!requirements) return null;
    if (requirements.max_ltv) return this.parsePercent(requirements.max_ltv);

    if (typeof requirements === 'object') {
      const values = Object.values(requirements)
        .map((value) => this.findMaxLtv(value))
        .filter((value) => value != null);

      if (values.length === 0) return null;
      return Math.max(...values);
    }

    return null;
  }

  findMaxLoanAmount(programData) {
    if (!programData) return null;
    if (programData.max_loan_amount) return this.parseCurrency(programData.max_loan_amount);

    if (programData.loan_amounts) {
      const values = Object.values(programData.loan_amounts)
        .map((value) => (typeof value === 'object' ? value.max : value))
        .map((value) => this.parseCurrency(value))
        .filter((value) => value != null);

      if (values.length === 0) return null;
      return Math.max(...values);
    }

    return null;
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

  parsePercent(value) {
    if (value == null) return null;
    if (typeof value === 'number' && !Number.isNaN(value)) {
      return value > 1 ? value : value * 100;
    }
    if (typeof value === 'string') {
      const numeric = parseFloat(value.replace(/[^\d.]/g, ''));
      if (Number.isNaN(numeric)) return null;
      return value.includes('%') || numeric <= 1 ? (numeric <= 1 ? numeric * 100 : numeric) : numeric;
    }
    return null;
  }

  parseCurrency(value) {
    if (value == null) return null;
    if (typeof value === 'number' && !Number.isNaN(value)) return value;
    if (typeof value === 'string') {
      let cleaned = value.replace(/[$,]/g, '');
      let multiplier = 1;

      if (cleaned.toLowerCase().includes('mm') || cleaned.toLowerCase().includes('m ')) {
        multiplier = 1000000;
        cleaned = cleaned.replace(/mm|m\s/i, '');
      } else if (cleaned.toLowerCase().includes('k')) {
        multiplier = 1000;
        cleaned = cleaned.replace(/k/i, '');
      }

      const numeric = parseFloat(cleaned);
      return Number.isNaN(numeric) ? null : numeric * multiplier;
    }
    return null;
  }

  normalizePropertyType(type) {
    if (!type) return '';
    const map = {
      single_family: 'single',
      duplex: 'duplex',
      triplex: 'triplex',
      fourplex: 'four',
      condo: 'condo',
      townhouse: 'town',
      investment: 'investment',
    };
    return map[type] || type;
  }
}

function findMissingFields(profile = {}) {
  const missing = [];
  if (!profile.propertyValue) missing.push('propertyValue');
  if (!profile.propertyType) missing.push('propertyType');
  if (!profile.propertyLocation) missing.push('propertyLocation');
  if (profile.downPaymentPercent == null) missing.push('downPaymentPercent');
  if (!profile.creditScore) missing.push('creditScore');
  return missing;
}

module.exports = {
  LenderMatcher,
  findMissingFields,
};
