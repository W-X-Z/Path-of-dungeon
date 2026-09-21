/**
 * 한국어 조사를 받침에 맞춰 붙입니다.
 *
 * '폭발 함정이(가)' 같은 표기는 읽는 사람을 문장 밖으로 밀어냅니다.
 * 방 이름은 무작위로 조합되므로 문구를 통째로 써 둘 수 없고,
 * 그렇다고 괄호로 넘길 일도 아닙니다.
 */

/** 마지막 글자에 받침이 있는지. 한글이 아니면 없는 것으로 봅니다. */
export function hasBatchim(word) {
  const s = String(word);
  if (!s) return false;
  const code = s.charCodeAt(s.length - 1);
  if (code < 0xac00 || code > 0xd7a3) return false;
  return (code - 0xac00) % 28 !== 0;
}

const PAIRS = {
  '이/가': ['이', '가'],
  '을/를': ['을', '를'],
  '은/는': ['은', '는'],
  '과/와': ['과', '와'],
  '으로/로': ['으로', '로'],
};

/** josa('폭발 함정', '이/가') -> '폭발 함정이' */
export function josa(word, pair) {
  const [withB, withoutB] = PAIRS[pair] ?? [];
  if (!withB) return String(word);
  // '로'는 ㄹ 받침일 때 '로'를 씁니다 (예: 거미굴로).
  if (pair === '으로/로' && String(word).length) {
    const code = String(word).charCodeAt(String(word).length - 1);
    if (code >= 0xac00 && code <= 0xd7a3 && (code - 0xac00) % 28 === 8) return `${word}로`;
  }
  return `${word}${hasBatchim(word) ? withB : withoutB}`;
}
