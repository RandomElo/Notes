import { describe, expect, it } from 'vitest';
import { versOctets } from '../fs/utf8';
import { sha256 } from './hash';

describe('sha256', () => {
  it('donne les empreintes de référence', () => {
    expect(sha256(new Uint8Array())).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
    expect(sha256(versOctets('abc'))).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    expect(sha256(versOctets('abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq'))).toBe(
      '248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1',
    );
  });

  it('traite les longueurs au bord d’un bloc', () => {
    // 55, 56 et 64 octets : le bourrage tient ou non dans le dernier bloc.
    expect(sha256(versOctets('a'.repeat(55)))).toBe('9f4390f8d30c2dd92ec9f095b65e2b9ae9b0a925a5258e241c9f1e910f734318');
    expect(sha256(versOctets('a'.repeat(56)))).toBe('b35439a4ac6f0948b6d6f9e3c6af0f5f590ce20f1bde7090ef7970686ec6738a');
    expect(sha256(versOctets('a'.repeat(64)))).toBe('ffe054fe7ae0cb6dc65c3af9b61d5209f439851db43d0ba5997337df154668eb');
  });
});
