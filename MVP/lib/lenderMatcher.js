const lenderDatabase = require('../lender_details/Comprehensive/comprehensive_lender_database.json');

const MATCH_CONFIDENCE_THRESHOLD = 0.6;

class LenderMatcher {
  constructor(database = lenderDatabase) {
    if (!database || !database.lenders) {
      throw new Error('Invalid lender database payload');
    }

    this.lenderDatabase = database;
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
        if (score.confidence >= 0.5) {
          matches.push(
            this.buildMatchObject(lenderKey, lenderData, program.program_type || program.program_name, score),
          );
        }
      });
    }

    if (lenderData.programs && typeof lenderData.programs === 'object') {
      Object.entries(lenderData.programs).forEach(([programKey, programData]) => {
        const score = this.scoreStructuredProgram(programKey, programData, buyerProfile, loanAmount);
        if (score.confidence >= 0.5) {
          matches.push(this.buildMatchObject(lenderKey, lenderData, programData.program_name || programKey, score));
        }
      });
    }

    if (matches.length === 0) {
      matches.push(
        this.buildMatchObject(lenderKey, lenderData, lenderData.company_name, {
          confidence: 0.5,
          reason: `${lenderData.company_name} offers programs worth reviewing once more details are provided.`,
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
    let confidence = 0.5;
    let reason = `${program.program_type || program.program_name || 'Program'} available. `;
    let maxLTV = this.parsePercent(program.max_ltv);
    let minCreditScore = this.extractMinCreditScore(program.credit_requirements);
    let maxLoanAmount = this.parseCurrency(program.max_loan_amount);

    if (buyerProfile.creditScore && minCreditScore) {
      if (buyerProfile.creditScore >= minCreditScore) {
        confidence += 0.3;
        reason += `Credit score ${buyerProfile.creditScore} meets ${minCreditScore}. `;
      } else {
        // Much stricter penalty for credit score below minimum
        const shortfall = (minCreditScore - buyerProfile.creditScore) / minCreditScore;
        confidence -= shortfall * 0.8; // Significant penalty
        confidence = Math.max(0, confidence); // Don't go below 0
        reason += `Credit score ${buyerProfile.creditScore} below minimum ${minCreditScore} requirement. `;
      }
    } else if (buyerProfile.creditScore && buyerProfile.creditScore >= 620) {
      confidence += 0.2;
      reason += `Documented credit score of ${buyerProfile.creditScore}. `;
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

    return { confidence: Math.min(confidence, 0.99), reason, maxLTV, minCreditScore, maxLoanAmount };
  }

  scoreStructuredProgram(programKey, programData, buyerProfile, loanAmount) {
    let bestScore = {
      confidence: 0.5,
      reason: `${programData.program_name || programKey} available. `,
      maxLTV: null,
      minCreditScore: null,
      maxLoanAmount: null,
    };

    if (programData.credit_requirements) {
      Object.values(programData.credit_requirements).forEach((requirement) => {
        const score = this.scoreProgramMatch(
          {
            program_type: programData.program_name || programKey,
            credit_requirements: requirement,
            max_ltv: this.findMaxLtv(requirement),
            max_loan_amount: this.findMaxLoanAmount(programData),
            property_types: programData.property_types,
            purpose: programData.specialty,
          },
          buyerProfile,
          loanAmount,
        );

        if (score.confidence > bestScore.confidence) {
          bestScore = score;
        }
      });
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
      if (creditRequirements.min_fico) return parseInt(creditRequirements.min_fico, 10);
      if (creditRequirements.min_credit_score) return parseInt(creditRequirements.min_credit_score, 10);

      const scores = Object.values(creditRequirements)
        .map((value) => this.extractMinCreditScore(value))
        .filter((score) => score != null);

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
      const numeric = parseFloat(value.replace(/[^0-9.]/g, ''));
      return Number.isNaN(numeric) ? null : numeric;
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

