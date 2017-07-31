import {errors} from 'apme';

export function validate(value, schema, text) {
    if(schema) {
        const validation = schema.validate(value);
        if (validation.error) {
            throw errors.validation(validation.error, text);
        }
        return validation.value;
    } else {
        return value;
    }
}
