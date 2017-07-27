import {validationError} from './errors';

export function validate(value, schema, text) {
    if(schema) {
        const validation = schema.validate(value);
        if (validation.error) {
            throw validationError(validation.error, text);
        }
        return validation.value;
    } else {
        return value;
    }
}
