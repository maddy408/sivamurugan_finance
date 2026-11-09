import { validatePhone } from './validation';
export * from './validation';

export const INDIAN_MOBILE_REGEX = /^[6-9][0-9]{9}$/;

export function validateIndianMobile(value, required = false) {
  return validatePhone(value, required, 'Mobile number');
}

export function isValidIndianMobile(value, required = false) {
  return validateIndianMobile(value, required) === '';
}
