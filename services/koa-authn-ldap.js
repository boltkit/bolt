const ajv = require("ajv");

/**
 * Koa authantication middleware based on passport strategies
 */
class KoaAuthnLdap {
  constructor({koa, koaAuthn, config, logger}) {
    this.passport = null;
    this.koa = koa;
    this.config = config;
    this.logger = logger;
    this.koaAuthn = koaAuthn;
    this.init();
  }

  authenticate() {
    return this.koaAuthn.getPassport().authenticate('ldapauth', {session: false});
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
            login: {type: "string"},
            logout: {type: "string"}
          },
          required: ['login', 'logout'],
          additionalProperties: false
        },
        views: {
          type: "object",
          properties: {
            login: {type: "string"}
          },
          required: ['login'],
          additionalProperties: false
        },
        userObjectMap: {
          type: "object",
          properties: {
            username: {type: "string"},
            displayName: {type: "string"}
          },
          required: ['username', 'displayName'],
          additionalProperties: true
        },
        server: {
          type: "object",
          properties: {
            url: {type: "string"},
            bindDN: {type: "string"},
            bindCredentials: {type: "string"},
            searchBase: {type: "string"},
            searchFilter: {type: "string"}
          },
          required: ['url', 'bindDN', 'bindCredentials', 'searchBase', 'searchFilter'],
          additionalProperties: true
        }
      },
      required: ['enable', 'routes', 'views', 'userObjectMap', 'server'],
      additionalProperties: false
    });
    if (!validate(conf)) {
      this.logger.error(`Error validating koa-authn-ldap.yml: ${validate.errors[0].message}`);
      process.exit(1);
    }
  }

  init() {
    const koa = this.koa;
    const config = this.config;
    const logger = this.logger;
    const koaAuthn = this.koaAuthn;
    let passport = null;
  
    // checking config
    const stratConfig = config.get('koaAuthnLdap');
    
    /**
     * Configuring ldap auth
     */
    if (stratConfig && stratConfig.enable) {
      this.validateConfig(stratConfig);
      logger.info("configuring ldap auth (koa-authn-ldap.yml)");
      
      const passport = koaAuthn.getPassport();
      const LdapStrategy = require('passport-ldapauth');
      
      passport.use(new LdapStrategy(stratConfig));
      console.log("koa router login", stratConfig.routes.login)
      koa.useRouter(koa.router
        .get(stratConfig.routes.login, async (ctx, next) => {
          //console.log("ctx.session", ctx.session.messages)
          // show login page only is unauthanticated
          // todo: handle XHR
          if (ctx.isAuthenticated()) {
            ctx.redirect("/");
          } else {
            await ctx.render(stratConfig.views.login, {routes: stratConfig.routes});
          }
        })
        .get(stratConfig.routes.logout, async (ctx, next) => {
          //const nextUrl = this.getFrontendUrl(ctx, false);
          ctx.session = null;
          ctx.redirect("/");
        })
        .post(stratConfig.routes.login, passport.authenticate('ldapauth', {session: true, failureMessage: true, failureRedirect: '/'}), (ctx, next) => {
          const isXHR = ctx.request.accepts('json', 'html') === 'json';


          if (ctx.isAuthenticated()) {
            ctx.session.user = ctx.state.user;
            if (isXHR) {
              ctx.response.status = 200;
              ctx.response.body = ({user: {
                email: ctx.state.user.mail,
                upn: ctx.state.user.userPrincipalName,
                displayName: ctx.state.user.displayName
              }});
            } else {
              ctx.redirect("/");
            }
          } else {
            if (isXHR) {
              ctx.response.status = 401;
              ctx.response.body = "bad credentials";
            } else {
              ctx.redirect(stratConfig.routes.login);
            }
          }
        })
      );
    } else {
      console.log("skipping ldap auth (koa-authn-ldap.yml is missing or disabled)");
    }
  }
}

module.exports = KoaAuthnLdap;
