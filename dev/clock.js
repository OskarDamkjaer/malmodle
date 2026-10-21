const dag = new URLSearchParams(location.search).get('dag');
if (/^\d{4}-\d{2}-\d{2}$/.test(dag ?? '')) {
  const Real = Date;
  const today = new Real();
  today.setHours(0, 0, 0, 0);
  const shift = new Real(`${dag}T00:00`) - today;
  globalThis.Date = class extends Real {
    constructor(...args) {
      if (args.length) super(...args);
      else super(Real.now() + shift);
    }

    static now() {
      return Real.now() + shift;
    }
  };
}
