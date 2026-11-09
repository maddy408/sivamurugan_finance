<?php
namespace App\Core;

/**
 * Minimal rule-based validator.
 *   $v = Validator::make($data, [
 *      'name'   => 'required|string|max:128',
 *      'amount' => 'required|numeric|min:0.01',
 *      'email'  => 'nullable|email',
 *   ]);
 *   $clean = $v->validated();   // throws HttpException(422) on failure
 */
class Validator
{
    private array $data;
    private array $rules;
    private array $errors = [];
    private array $clean = [];

    private function __construct(array $data, array $rules)
    {
        $this->data = $data;
        $this->rules = $rules;
    }

    public static function validateIndianMobileValue($value, bool $required = false): ?string
    {
        $str = $value === null ? '' : (string)$value;
        if ($str === '') {
            return $required ? 'Mobile number is required.' : null;
        }
        if (!preg_match('/^[0-9]+$/', $str)) {
            return 'Only numeric digits are allowed.';
        }
        if (!preg_match('/^[6-9]/', $str)) {
            return 'Mobile number must start with 6, 7, 8, or 9.';
        }
        if (strlen($str) < 10) {
            return 'Mobile number must contain exactly 10 digits.';
        }
        if (strlen($str) > 10) {
            return 'Mobile number cannot exceed 10 digits.';
        }
        return null;
    }

    public static function validateAadhaarValue($value, bool $required = false): ?string
    {
        $str = $value === null ? '' : trim((string)$value);
        if ($str === '') {
            return $required ? 'Aadhaar number is required.' : null;
        }
        if (!preg_match('/^[0-9]+$/', $str)) {
            return 'Only numeric digits are allowed.';
        }
        if (strlen($str) !== 12) {
            return 'Aadhaar number must contain exactly 12 digits.';
        }
        return null;
    }

    public static function make(array $data, array $rules): self
    {
        $v = new self($data, $rules);
        $v->run();
        return $v;
    }

    private function run(): void
    {
        foreach ($this->rules as $field => $ruleStr) {
            $rules = explode('|', $ruleStr);
            $value = $this->data[$field] ?? null;
            $nullable = in_array('nullable', $rules, true);
            $present = array_key_exists($field, $this->data) && $value !== null && $value !== '';

            $isMobileRule = in_array('indian_mobile', $rules, true) || in_array('mobile', $rules, true);
            $isAadhaarRule = in_array('aadhaar', $rules, true) || in_array('aadhar', $rules, true);

            if (!$present) {
                if (in_array('required', $rules, true)) {
                    if ($isAadhaarRule) {
                        $this->errors[$field][] = 'Aadhaar number is required.';
                    } elseif ($isMobileRule) {
                        $this->errors[$field][] = 'Mobile number is required.';
                    } else {
                        $this->errors[$field][] = "$field is required";
                    }
                } elseif ($nullable || !in_array('required', $rules, true)) {
                    $this->clean[$field] = null;
                }
                continue;
            }

            // Determine the field's declared scalar type so min/max know whether
            // to measure a number or a string length (a numeric-looking string
            // like a phone number must still be length-checked).
            $isNumericType = (bool)array_intersect($rules, ['numeric', 'int'])
                || (bool)preg_grep('/^(numeric|int)$/', $rules);
            $lengthMode = !$isNumericType;

            foreach ($rules as $rule) {
                if ($rule === 'required' || $rule === 'nullable') {
                    continue;
                }
                [$name, $arg] = array_pad(explode(':', $rule, 2), 2, null);
                switch ($name) {
                    case 'string':
                        if (!is_string($value)) $this->errors[$field][] = "$field must be a string";
                        break;
                    case 'int':
                        if (filter_var($value, FILTER_VALIDATE_INT) === false)
                            $this->errors[$field][] = "$field must be an integer";
                        else $value = (int)$value;
                        break;
                    case 'numeric':
                        if (!is_numeric($value)) $this->errors[$field][] = "$field must be numeric";
                        else $value = (float)$value;
                        break;
                    case 'bool':
                        $value = filter_var($value, FILTER_VALIDATE_BOOL);
                        break;
                    case 'email':
                        if (!filter_var($value, FILTER_VALIDATE_EMAIL))
                            $this->errors[$field][] = 'Enter a valid email address.';
                        break;
                    case 'aadhaar':
                    case 'aadhar':
                        $aadhaarErr = self::validateAadhaarValue($value, false);
                        if ($aadhaarErr !== null) {
                            $this->errors[$field][] = $aadhaarErr;
                        } else {
                            $value = (string)$value;
                        }
                        break;
                    case 'date':
                        $d = \DateTime::createFromFormat('Y-m-d', (string)$value);
                        if (!$d || $d->format('Y-m-d') !== $value)
                            $this->errors[$field][] = "$field must be a date (YYYY-MM-DD)";
                        break;
                    case 'min':
                        if ($lengthMode) {
                            if (mb_strlen((string)$value) < (int)$arg)
                                $this->errors[$field][] = "$field must be at least $arg characters";
                        } elseif ((float)$value < (float)$arg) {
                            $this->errors[$field][] = "$field must be >= $arg";
                        }
                        break;
                    case 'max':
                        if ($lengthMode) {
                            if (mb_strlen((string)$value) > (int)$arg)
                                $this->errors[$field][] = "$field must be at most $arg characters";
                        } elseif ((float)$value > (float)$arg) {
                            $this->errors[$field][] = "$field must be <= $arg";
                        }
                        break;
                    case 'in':
                        $opts = explode(',', (string)$arg);
                        if (!in_array((string)$value, $opts, true))
                            $this->errors[$field][] = "$field must be one of: " . implode(', ', $opts);
                        break;
                    case 'indian_mobile':
                    case 'mobile':
                        $mobileErr = self::validateIndianMobileValue($value, false);
                        if ($mobileErr !== null) {
                            $this->errors[$field][] = $mobileErr;
                        } else {
                            $value = (string)$value;
                        }
                        break;
                }
            }
            $this->clean[$field] = $value;
        }
    }

    public function fails(): bool
    {
        return !empty($this->errors);
    }

    public function validated(): array
    {
        if ($this->fails()) {
            throw HttpException::validation($this->errors);
        }
        return $this->clean;
    }
}
