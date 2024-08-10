const ajv = require("ajv");

/**
 * Koa authantication middleware based on passport strategies
 */
class KoaAuthn {
  constructor({koa, config, logger}) {
    this.passport = null;
    this.koa = koa;
    this.logger = logger;
    this.authnConfig = config.get('koaAuthn');
    this.validateConfig(this.authnConfig);
  }

  requireUser() {
    return (async (ctx, next) => {
      const res = ctx.requireUser && await ctx.requireUser();
      if (res === true) {
        await next();
      }
    });
  }

  validateConfig(conf) {
    const ajvInstance = new ajv({useDefaults: true});

    const validate = ajvInstance.compile({
      type: "object",
      properties: {
        enable: {
          type: "boolean"
        },
        routes: {
          type: "object",
          properties: {
            login: {type: "string"}
          },
          required: ['login'],
          additionalProperties: false
        }
      },
      required: ['enable', 'routes'],
      additionalProperties: false
    });
    if (!validate(conf)) {
      this.logger.error(`Error validating koa-authn.yml: ${validate.errors[0].message}`);
      process.exit(1);
    }
  }

  getPassport() {
    if (!this.passport) {
      this.passport = require('koa-passport');

      //  serialize user
      this.passport.serializeUser(function(user, done) {
        //console.log("serializeUser", user);
        const decoratedUser = Object.assign(user, {displayName: user.cn || user.email || user.mail || '?'});
        done(null, decoratedUser);
      });

      this.passport.deserializeUser(function(user, done) {
        //console.log("deserializeUser", user);
        const decoratedUser = Object.assign(user, {displayName: user.cn || user.email || user.mail || '?'});
        done(null, decoratedUser);
      });

      this.registerPassport();
    }
    return this.passport;
  }

  registerPassport() {
    if (this.passport) {
      const conf = this.authnConfig;

      // register koa middleware
      this.koa.useMiddleware(this.passport.initialize())
      this.koa.useMiddleware(this.passport.session())

      // add ctx.requireUser
      this.koa.useMiddleware((async (ctx, next) => {
        const isXHR = ctx.request.accepts('json', 'html') === 'json';
        
        /*
          //shall be used inside action with
          if (await ctx.requireUser()) {
            // 
          } else {
            //
          }
        */
        ctx.requireUser = async () => {
          if (ctx.state.user) {
            // ok
            console.log("ctx.checkAuthN : user state set");
            return true;
          } else if (ctx.session.user) {
            // ok, we logged in with a cookie
            ctx.state.user = ctx.session.user;
            console.log("ctx.checkAuthN : user session/state set");
            return true;
          } else if (false) {
            // ok, we logged in wit hbasic auth
            // @todo
            console.log("ctx.checkAuthN : basic auth set");
            return true;
          } else {
            console.log("ctx.checkAuthN : user unset");
            if (isXHR || !(conf && conf.routes && conf.routes.login)) {
              ctx.throw(401, "unauthenticated");
            } else {
              /// TODO: END output.... ....
              // koa is stupid here, since it has absolutly no clean way to end middleware chain
              // it means that code after this mw will execute anyway... which shall not be of course
              // sure if i put ans if (ctx.requireUser()) it will work but it is not clean
              ctx.redirect(conf.routes.login);
            }
          }
          return false;
        };
        
        ctx.requirePermission = async (resType, resId, permissions) => {
          if (ctx.state.user) {
            // ok
            console.log(`ctx::requirePermission : ${resType} ${resId} ${permissions}`);
            return true;
          } else {
            console.log("ctx::requirePermission : user unset");
            if (isXHR || !(conf && conf.routes && conf.routes.login)) {
              ctx.throw(401, "unauthenticated");
            } else {
              ctx.redirect(conf.routes.login);
            }
          }
          return false;
        };


        // next
        await next();
      }));
    }
  }
}

module.exports = KoaAuthn;
