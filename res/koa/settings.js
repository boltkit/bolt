const moment = require("moment")
const ajv = require("ajv");
const yaml = require('js-yaml');
const jsf = require('json-schema-faker');

class SettingsController {

  constructor({koa, bull, mongoose, koaAuthn}) {
    this.bull = bull;
    this.mongoose = mongoose;
    koa.useRouter(koa.router
      .use(koaAuthn.requireUser())
      .get('/settings/account', this.showAccount.bind(this))
      .get('/settings/tokens', this.showTokens.bind(this))
    );
  }

  async showAccount(ctx, next) {
    await ctx.render('settings-account', {user: ctx.state.user})
  }

  async showTokens(ctx, next) {
    await ctx.render('settings-tokens', {user: ctx.state.user});
  }
}

module.exports = SettingsController;
