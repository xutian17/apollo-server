const _ = require('lodash');
import * as express from 'express';
import * as url from 'url';
import { GraphQLOptions, HttpQueryError, runHttpQuery } from 'apollo-server-core';
import * as GraphiQL from 'apollo-server-module-graphiql';

export interface ExpressGraphQLOptionsFunction {
  (req?: express.Request, res?: express.Response): GraphQLOptions | Promise<GraphQLOptions>;
}

// Design principles:
// - there is just one way allowed: POST request with JSON body. Nothing else.
// - simple, fast and secure
//

export interface ExpressHandler {
  (req: express.Request, res: express.Response, next): void;
}

export function graphqlExpress(options: GraphQLOptions | ExpressGraphQLOptionsFunction): ExpressHandler {
  if (!options) {
    throw new Error('Apollo Server requires options.');
  }

  if (arguments.length > 1) {
    // TODO: test this
    throw new Error(`Apollo Server expects exactly one argument, got ${arguments.length}`);
  }

  return (req: express.Request, res: express.Response, next): void | Promise<any> => {
    var skipRes = res === null;
    runHttpQuery([req, res], {
      method: req.method,
      options: options,
      query: req.method === 'POST' ? req.body : req.query,
    }).then((gqlResponse) => {
      if (skipRes) {
        return gqlResponse;
      }
      res.setHeader('Content-Type', 'application/json');
      /* tslint:disable */
      // res.setHeader('Content-Length', Buffer.byteLength(gqlResponse, 'utf8'));
      /* tslint:enable */
      res.write(gqlResponse);
      res.end();
    }, (error: HttpQueryError) => {
      if ( 'HttpQueryError' !== error.name ) {
        return next(error);
      }

      if (!skipRes) {
          if ( error.headers ) {
              Object.keys(error.headers).forEach((header) => {
                res.setHeader(header, error.headers[header]);
            });
          }
          res.statusCode = error.statusCode;
      }

      var errorObj;
      try {
          var errorObj = JSON.parse(error.message);
          errorObj.data = null;
          if (skipRes) {
            return errorObj;
          }
          res.write(JSON.stringify(errorObj));
      } catch (e) {
          // fallback
          if (skipRes) {
            return error.message;
          }
          res.write(error.message);
      }

      res.end();
    });
  };
}

export interface ExpressGraphiQLOptionsFunction {
  (req?: express.Request): GraphiQL.GraphiQLData | Promise<GraphiQL.GraphiQLData>;
}

/* This middleware returns the html for the GraphiQL interactive query UI
 *
 * GraphiQLData arguments
 *
 * - endpointURL: the relative or absolute URL for the endpoint which GraphiQL will make queries to
 * - (optional) query: the GraphQL query to pre-fill in the GraphiQL UI
 * - (optional) variables: a JS object of variables to pre-fill in the GraphiQL UI
 * - (optional) operationName: the operationName to pre-fill in the GraphiQL UI
 * - (optional) result: the result of the query to pre-fill in the GraphiQL UI
 */

export function graphiqlExpress(options: GraphiQL.GraphiQLData | ExpressGraphiQLOptionsFunction) {
  return (req: express.Request, res: express.Response, next) => {
    const query = req.url && url.parse(req.url, true).query;
    GraphiQL.resolveGraphiQLString(query, options, req).then(graphiqlString => {
      res.setHeader('Content-Type', 'text/html');
      res.write(graphiqlString);
      res.end();
    }, error => next(error));
  };
}
