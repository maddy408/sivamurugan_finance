/**
 * Complete Centralized Form Validation System
 * Finance Project
 */

/**
 * Block non-numeric keystrokes for number-only fields (mobile, aadhaar).
 * Allows navigation, editing, control keys (Ctrl/Cmd+A, C, V, X, Z) and Backspace/Delete.
 */
export function handleNumericKeyDown(e) {
  if (
    e.ctrlKey ||
    e.metaKey ||
    [
      'Backspace', 'Tab', 'Enter', 'Escape', 'ArrowLeft', 'ArrowRight',
      'ArrowUp', 'ArrowDown', 'Delete', 'Home', 'End'
    ].includes(e.key)
  ) {
    return;
  }
  if (!/^[0-9]$/.test(e.key)) {
    e.preventDefault();
  }
}

/**
 * Filter out non-digits and cap at max length.
 */
export function sanitizeDigits(value, maxLen = 10) {
  if (value === null || value === undefined) return '';
  return String(value).replace(/\D/g, '').slice(0, maxLen);
}

// Phone / Mobile Validation (Indian 10-digit mobile number)
export function validatePhone(value, required = false, fieldLabel = 'Mobile number') {
  const str = value === null || value === undefined ? '' : String(value).trim();
  if (str === '') {
    return required ? `${fieldLabel} is required.` : '';
  }
  if (!/^\d+$/.test(str)) {
    return 'Only numeric digits are allowed.';
  }
  if (!/^[6-9]/.test(str)) {
    return 'Mobile number must start with 6, 7, 8, or 9.';
  }
  if (str.length < 10) {
    return 'Mobile number must contain exactly 10 digits.';
  }
  if (str.length > 10) {
    return 'Mobile number cannot exceed 10 digits.';
  }
  return '';
}

// Aadhaar Number Validation (Exactly 12 digits, numeric only)
export function validateAadhaar(value, required = false) {
  const str = value === null || value === undefined ? '' : String(value).trim();
  if (str === '') {
    return required ? 'Aadhaar number is required.' : '';
  }
  if (!/^\d+$/.test(str)) {
    return 'Only numeric digits are allowed.';
  }
  if (str.length !== 12) {
    return 'Aadhaar number must contain exactly 12 digits.';
  }
  return '';
}

// Email Validation
export function validateEmail(value, required = false) {
  const str = value === null || value === undefined ? '' : String(value).trim();
  if (str === '') {
    return required ? 'Email address is required.' : '';
  }
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
  if (!emailRegex.test(str)) {
    return 'Enter a valid email address.';
  }
  return '';
}

// Required / Non-empty Text
export function validateRequired(value, fieldLabel = 'This field') {
  const str = value === null || value === undefined ? '' : String(value).trim();
  if (str === '') {
    return `${fieldLabel} is required.`;
  }
  return '';
}

// Text with Min/Max
export function validateText(value, { required = true, min = 1, max = null, fieldLabel = 'This field' } = {}) {
  const str = value === null || value === undefined ? '' : String(value).trim();
  if (str === '') {
    return required ? `${fieldLabel} is required.` : '';
  }
  if (min !== null && str.length < min) {
    return `${fieldLabel} must be at least ${min} characters.`;
  }
  if (max !== null && str.length > max) {
    return `${fieldLabel} cannot exceed ${max} characters.`;
  }
  return '';
}

// Money / Amount Fields
export function validateAmount(value, { required = true, min = 0.01, max = null, fieldLabel = 'Amount' } = {}) {
  const str = value === null || value === undefined ? '' : String(value).trim();
  if (str === '') {
    return required ? `${fieldLabel} is required.` : '';
  }
  const num = Number(str);
  if (isNaN(num)) {
    return `${fieldLabel} must be a valid number.`;
  }
  if (min !== null && num < min) {
    return min > 0 ? `${fieldLabel} must be greater than 0.` : `${fieldLabel} cannot be negative.`;
  }
  if (max !== null && num > max) {
    return `${fieldLabel} cannot exceed ${max}.`;
  }
  return '';
}

// Integer / Count / Tenure
export function validateInteger(value, { required = true, min = 1, max = null, fieldLabel = 'Value' } = {}) {
  const str = value === null || value === undefined ? '' : String(value).trim();
  if (str === '') {
    return required ? `${fieldLabel} is required.` : '';
  }
  if (!/^-?\d+$/.test(str)) {
    return `${fieldLabel} must be a whole number.`;
  }
  const num = parseInt(str, 10);
  if (min !== null && num < min) {
    return `${fieldLabel} must be at least ${min}.`;
  }
  if (max !== null && num > max) {
    return `${fieldLabel} cannot exceed ${max}.`;
  }
  return '';
}

// Date Validation
export function validateDate(value, { required = true, min = null, max = null, notFuture = false, fieldLabel = 'Date' } = {}) {
  const str = value === null || value === undefined ? '' : String(value).trim();
  if (str === '') {
    return required ? `${fieldLabel} is required.` : '';
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(str) || isNaN(Date.parse(str))) {
    return 'Enter a valid date.';
  }
  const todayStr = new Date().toISOString().slice(0, 10);
  if (notFuture && str > todayStr) {
    return `${fieldLabel} cannot be in the future.`;
  }
  if (min && str < min) {
    return `${fieldLabel} cannot be earlier than ${min}.`;
  }
  if (max && str > max) {
    return `${fieldLabel} cannot be later than ${max}.`;
  }
  return '';
}

// Select / Dropdown Selection
export function validateSelect(value, fieldLabel = 'Option') {
  if (value === null || value === undefined) {
    return `Please select a ${fieldLabel.toLowerCase()}.`;
  }
  const str = String(value).trim();
  if (str === '' || str === 'Select' || str === '—') {
    return `Please select a ${fieldLabel.toLowerCase()}.`;
  }
  return '';
}

// Password Validation
export function validatePassword(value, { required = true, min = 8, fieldLabel = 'Password' } = {}) {
  const str = value === null || value === undefined ? '' : String(value);
  if (str === '') {
    return required ? `${fieldLabel} is required.` : '';
  }
  if (str.length < min) {
    return `${fieldLabel} must be at least ${min} characters.`;
  }
  return '';
}

// Confirm Password Validation
export function validateConfirmPassword(password, confirmPassword) {
  const confirmStr = confirmPassword === null || confirmPassword === undefined ? '' : String(confirmPassword);
  if (!confirmStr) {
    return 'Please confirm your password.';
  }
  if (password !== confirmPassword) {
    return 'Passwords do not match.';
  }
  return '';
}

/**
 * Focus and smoothly scroll to the first element that has an error.
 */
export function focusFirstError(errors) {
  if (!errors || typeof errors !== 'object') return;
  const errorKeys = Object.keys(errors).filter((k) => !!errors[k]);
  if (errorKeys.length === 0) return;

  for (const key of errorKeys) {
    const selector = `[name="${key}"], #${key}, [data-field="${key}"], input[name="${key}"], select[name="${key}"], textarea[name="${key}"]`;
    const el = document.querySelector(selector);
    if (el && typeof el.focus === 'function') {
      try {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        el.focus();
      } catch (err) {
        el.focus();
      }
      return;
    }
  }
}

// Re-export mobile validation under standard name
export const validateIndianMobile = validatePhone;

