/**
 * Completion Criteria Evaluation Service
 * Supports multiple criteria types: contains, regex, json, code, llm
 */

/**
 * Evaluate if the output meets the completion criteria
 * @param {string} output - The LLM response output
 * @param {string} criteriaType - Type of criteria check
 * @param {string} criteriaValue - The criteria value/pattern
 * @param {function} llmCall - Optional LLM call function for 'llm' type
 * @returns {Promise<{passed: boolean, reason: string}>}
 */
async function evaluateCriteria(output, criteriaType, criteriaValue, llmCall = null) {
  if (!output) {
    return { passed: false, reason: 'No output received' };
  }

  switch (criteriaType) {
    case 'contains':
      return evaluateContains(output, criteriaValue);
    
    case 'not_contains':
      return evaluateNotContains(output, criteriaValue);
    
    case 'regex':
      return evaluateRegex(output, criteriaValue);
    
    case 'json':
      return evaluateJson(output);
    
    case 'code':
      return evaluateCode(output, criteriaValue);
    
    case 'length_min':
      return evaluateLengthMin(output, criteriaValue);
    
    case 'length_max':
      return evaluateLengthMax(output, criteriaValue);
    
    case 'llm':
      return evaluateLLM(output, criteriaValue, llmCall);
    
    case 'always':
      return { passed: true, reason: 'Always passes' };
    
    default:
      return { passed: true, reason: 'No criteria specified, auto-pass' };
  }
}

function evaluateContains(output, value) {
  if (!value) {
    return { passed: true, reason: 'No value to check' };
  }
  
  const contains = output.toLowerCase().includes(value.toLowerCase());
  return {
    passed: contains,
    reason: contains ? `Output contains "${value}"` : `Output does not contain "${value}"`
  };
}

function evaluateNotContains(output, value) {
  if (!value) {
    return { passed: true, reason: 'No value to check' };
  }
  
  const contains = output.toLowerCase().includes(value.toLowerCase());
  return {
    passed: !contains,
    reason: !contains ? `Output does not contain "${value}"` : `Output contains "${value}" (should not)`
  };
}

function evaluateRegex(output, pattern) {
  if (!pattern) {
    return { passed: true, reason: 'No pattern to match' };
  }
  
  try {
    const regex = new RegExp(pattern, 'im');
    const matches = regex.test(output);
    return {
      passed: matches,
      reason: matches ? `Output matches pattern "${pattern}"` : `Output does not match pattern "${pattern}"`
    };
  } catch (error) {
    return { passed: false, reason: `Invalid regex pattern: ${error.message}` };
  }
}

function evaluateJson(output) {
  // Try to find JSON in the output
  const jsonPatterns = [
    /```json\s*([\s\S]*?)\s*```/,
    /```\s*([\s\S]*?)\s*```/,
    /(\{[\s\S]*\})/,
    /(\[[\s\S]*\])/
  ];
  
  for (const pattern of jsonPatterns) {
    const match = output.match(pattern);
    if (match) {
      try {
        JSON.parse(match[1]);
        return { passed: true, reason: 'Valid JSON found in output' };
      } catch {
        // Continue to next pattern
      }
    }
  }
  
  // Try parsing the entire output
  try {
    JSON.parse(output);
    return { passed: true, reason: 'Output is valid JSON' };
  } catch {
    return { passed: false, reason: 'No valid JSON found in output' };
  }
}

function evaluateCode(output, language = '') {
  // Check for code blocks
  const codeBlockPattern = /```[\s\S]*?```/g;
  const codeBlocks = output.match(codeBlockPattern);
  
  if (!codeBlocks || codeBlocks.length === 0) {
    // Check for common code patterns without blocks
    const codePatterns = [
      /def\s+\w+\s*\(/,  // Python function
      /function\s+\w+\s*\(/,  // JavaScript function
      /class\s+\w+/,  // Class definition
      /import\s+/,  // Import statement
      /const\s+|let\s+|var\s+/  // Variable declaration
    ];
    
    const hasCode = codePatterns.some(p => p.test(output));
    return {
      passed: hasCode,
      reason: hasCode ? 'Code detected in output' : 'No code blocks or patterns found'
    };
  }
  
  // If a specific language is specified, check for it
  if (language) {
    const langPattern = new RegExp('```' + language, 'i');
    const hasLang = codeBlocks.some(block => langPattern.test(block));
    return {
      passed: hasLang,
      reason: hasLang ? `${language} code block found` : `No ${language} code block found`
    };
  }
  
  return { passed: true, reason: `Found ${codeBlocks.length} code block(s)` };
}

function evaluateLengthMin(output, minLength) {
  const min = parseInt(minLength) || 0;
  const passed = output.length >= min;
  return {
    passed,
    reason: passed ? `Output length (${output.length}) meets minimum (${min})` : `Output too short (${output.length} < ${min})`
  };
}

function evaluateLengthMax(output, maxLength) {
  const max = parseInt(maxLength) || Infinity;
  const passed = output.length <= max;
  return {
    passed,
    reason: passed ? `Output length (${output.length}) within maximum (${max})` : `Output too long (${output.length} > ${max})`
  };
}

async function evaluateLLM(output, criteria, llmCall) {
  if (!llmCall) {
    return { passed: false, reason: 'LLM evaluation not available' };
  }
  
  try {
    const evaluationPrompt = `You are evaluating whether an AI response meets specific criteria.

CRITERIA: ${criteria}

RESPONSE TO EVALUATE:
${output}

Does this response meet the criteria? Reply with ONLY "PASS" or "FAIL" followed by a brief explanation.`;

    const result = await llmCall(evaluationPrompt, 'gpt-4o-mini');
    const passed = result.content.toUpperCase().startsWith('PASS');
    
    return {
      passed,
      reason: result.content
    };
  } catch (error) {
    return { passed: false, reason: `LLM evaluation failed: ${error.message}` };
  }
}

/**
 * Extract relevant context from output based on context mode
 * @param {string} output - The full output
 * @param {string} mode - Context extraction mode
 * @returns {string}
 */
function extractContext(output, mode = 'full') {
  if (!output) return '';
  
  switch (mode) {
    case 'full':
      return output;
    
    case 'code_only':
      const codeBlocks = output.match(/```[\s\S]*?```/g);
      if (codeBlocks) {
        return codeBlocks.map(block => {
          // Remove the ``` markers
          return block.replace(/```\w*\n?/g, '').trim();
        }).join('\n\n');
      }
      return output;
    
    case 'last_paragraph':
      const paragraphs = output.split(/\n\n+/).filter(p => p.trim());
      return paragraphs[paragraphs.length - 1] || output;
    
    case 'first_paragraph':
      const paras = output.split(/\n\n+/).filter(p => p.trim());
      return paras[0] || output;
    
    case 'summary':
      // Take first 500 chars as summary (actual implementation would use LLM)
      if (output.length <= 500) return output;
      return output.substring(0, 500) + '...';
    
    default:
      return output;
  }
}

module.exports = { evaluateCriteria, extractContext };
