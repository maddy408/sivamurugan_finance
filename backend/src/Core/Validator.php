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

            if (!$present) {
                if (in_array('required', $rules, true)) {
                    $this->errors[$field][] = "$field is required";
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
                            $this->errors[$field][] = "$field must be a valid email";
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
