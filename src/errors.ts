export function validationError(validationError, text? : string) {
    const err = <any> new Error(`${text || 'Validation error'}: ${validationError.message}`);
    err.validation = validationError;
    err.httpCode = 400;
    return err;
}

export function unauthorizedError(str? : string) {
    const err = <any> new Error(str || 'Unauthorized');
    err.httpCode = 401;
    return err;
}

export function forbiddenError(str? : string) {
    const err = <any> new Error(str || 'Forbidden');
    err.httpCode = 403;
    return err;
}

export function notFoundError(str? : string) {
    const err = <any> new Error(str || 'Not found');
    err.httpCode = 404;
    return err;
}

export function badRequestError(str? : string) {
    const err = <any> new Error(str || 'Bad Request');
    err.httpCode = 400;
    return err;
}

export function methodNotAllowedError(str? : string) {
    const err = <any> new Error(str || 'Method Not Allowed');
    err.httpCode = 405;
    return err;
}

export function jsonErrorHandler(options : {
    debug?: boolean,
    errorLog?: (err) => void
} = {}) {
    const debug = ('debug' in options) ? !!options.debug : true;
    const errorLog = options.errorLog || (err => { console.error(err.stack || err) });
    return (err, req, res, next) => {
        errorLog(err);
        res.status(err.httpCode || 500).json({
            errors: [{
                title: err.message,
                meta: {
                    stack: (debug && err.stack) ? err.stack.split('\n') : undefined,
                    validation: err.validation
                }
            }]
        });
    };
}