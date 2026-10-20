import { INVITE_CODE_LENGTH } from '@bomberman/shared';

/** Alphabet sans caractères ambigus (ni I/1, ni O/0) pour un code lisible à l'oral. */
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/** Génère un code d'invitation pour un salon privé. */
export function generateInviteCode(length: number = INVITE_CODE_LENGTH): string {
  let code = '';
  for (let i = 0; i < length; i++) {
    code += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  }
  return code;
}
