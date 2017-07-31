
import {RequestHandler, ErrorRequestHandler, Router} from 'express';
import {ApmeInterface} from 'apme';

export interface JsonApiInterface {
    expressInitMiddleware() : RequestHandler;
    expressJsonApiRouter() : Router;
}

export function jsonApi(options: {url?: string}) : (apme: ApmeInterface) => JsonApiInterface;

export function jsonErrorHandler(options? : {
    debug?: boolean,
    errorLog?: (err) => void
}) : (err, req, res, next) => void;