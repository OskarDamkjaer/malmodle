import { dailySet, setId } from '../app/daily.mjs';

const QUIZ = '/data/quiz.json';
const loaded = new WeakMap();

async function items(env, url) {
  if (!env.ASSETS) return null;
  if (!loaded.has(env.ASSETS)) {
    const loading = env.ASSETS.fetch(new Request(new URL(QUIZ, url)))
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(`${QUIZ}: ${res.status}`))))
      .then((quiz) => ({ items: quiz.items, sets: new Map() }));
    loaded.set(env.ASSETS, loading);
    loading.catch(() => loaded.delete(env.ASSETS));
  }
  return loaded.get(env.ASSETS);
}

export async function daySet(env, url, day) {
  try {
    const quiz = await items(env, url);
    if (!quiz) return null;
    if (!quiz.sets.has(day)) quiz.sets.set(day, setId(dailySet(quiz.items, day)));
    return quiz.sets.get(day);
  } catch (err) {
    console.error('sets:', err);
    return null;
  }
}
