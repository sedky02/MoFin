// Pin the ICU locale so money/date goldens don't depend on the machine's LANG.
// Jest workers are spawned after this runs, so they inherit it.
module.exports = async () => {
  process.env.LC_ALL = 'en_US.UTF-8';
  process.env.LANG = 'en_US.UTF-8';
  process.env.LANGUAGE = 'en_US';
};
