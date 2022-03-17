module.exports = ({
  bull
}) => bull.worker('default', (job) => {
  return Promise.resolve(true);
});