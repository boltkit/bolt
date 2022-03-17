const views = require('koa-views');

const render = views(__dirname + '/views', {
  map: {
    html: 'ejs'
  }
});

module.exports = ({koa}) => {
  koa.useMiddleware(render);
};
