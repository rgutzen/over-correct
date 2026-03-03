/* Over-Correct — shared chaos engine
   Loaded as a content-script file before content.js.
   Functions are prefixed OC_ to avoid collisions with page globals. */

const OC_ADJACENT_KEYS = {
  q:'wa',   w:'qase', e:'wsdr', r:'edft', t:'rfgy', y:'tghu', u:'yhji',
  i:'ujko', o:'iklp', p:'ol',   a:'qwsz', s:'awedxz', d:'serfcx',
  f:'drtgvc', g:'ftyhbv', h:'gyujnb', j:'huikmn', k:'jiolm', l:'kop',
  z:'asx', x:'zsdc', c:'xdfv', v:'cfgb', b:'vghn', n:'bhjm', m:'njk',
};

const OC_HOMOPHONES = {
  their:'there', there:'their', "they're":'their',
  your:"you're", "you're":'your',
  its:"it's", "it's":'its',
  to:'too', too:'to', two:'to',
  then:'than', than:'then',
  affect:'effect', effect:'affect',
  here:'hear', hear:'here',
  where:'wear', wear:'where',
  right:'write', write:'right',
  new:'knew', knew:'new',
  meet:'meat', meat:'meet',
  see:'sea', sea:'see',
  for:'four', four:'for',
  by:'buy', buy:'by',
  be:'bee', bee:'be',
  no:'know', know:'no',
};

function _ocR() { return Math.random(); }
function _ocPick(arr) { return arr[Math.floor(_ocR() * arr.length)]; }
function _ocAlpha(ch) { return /[a-zA-Z]/.test(ch); }

function _ocAdjacentKey(ch) {
  const lower = ch.toLowerCase();
  const neighbors = OC_ADJACENT_KEYS[lower] || lower;
  const rep = _ocPick([...neighbors]);
  return ch === ch.toUpperCase() ? rep.toUpperCase() : rep;
}

function _ocApplyToChars(text, prob, fn) {
  return [...text].map(ch => _ocAlpha(ch) && _ocR() < prob ? fn(ch) : ch).join('');
}

function _ocTranspose(text, prob) {
  const c = [...text];
  for (let i = 0; i < c.length - 1; i++) {
    if (_ocAlpha(c[i]) && _ocAlpha(c[i+1]) && _ocR() < prob) [c[i], c[i+1]] = [c[i+1], c[i]];
  }
  return c.join('');
}

function _ocDropChar(text, prob) {
  return [...text].filter(ch => !(_ocAlpha(ch) && _ocR() < prob)).join('');
}

function _ocDoubleChar(text, prob) {
  return [...text].flatMap(ch => _ocAlpha(ch) && _ocR() < prob ? [ch, ch] : [ch]).join('');
}

function _ocHomoSwap(text, prob) {
  return text.split(' ').map(w => {
    const lower = w.toLowerCase();
    if (lower in OC_HOMOPHONES && _ocR() < prob) {
      const rep = OC_HOMOPHONES[lower];
      return w[0] === w[0].toUpperCase() ? rep[0].toUpperCase() + rep.slice(1) : rep;
    }
    return w;
  }).join(' ');
}

function _ocScramble(text, prob) {
  return text.split(' ').map(w => {
    if (w.length <= 3 || _ocR() >= prob) return w;
    const mid = [...w.slice(1,-1)];
    for (let i = mid.length-1; i > 0; i--) {
      const j = Math.floor(_ocR() * (i+1)); [mid[i], mid[j]] = [mid[j], mid[i]];
    }
    return w[0] + mid.join('') + w[w.length-1];
  }).join(' ');
}

function _ocRandomCase(text, prob) {
  return [...text].map(ch => _ocAlpha(ch) && _ocR() < prob ? ch.toUpperCase() : ch).join('');
}

function _ocInjectRandom(text, prob) {
  const alpha = [...'abcdefghijklmnopqrstuvwxyz'];
  return [...text].flatMap(ch => [ch, ...(_ocR() < prob ? [_ocPick(alpha)] : [])]).join('');
}

function ocApplyChaos(text, dial) {
  if (dial >= 0) return text;
  const level = Math.min(Math.abs(dial), 10);
  if (level >= 0.1) {
    const s = Math.min(level, 1);
    text = _ocApplyToChars(text, 0.03*s, _ocAdjacentKey);
    text = _ocTranspose(text, 0.03*s);
    text = _ocHomoSwap(text, 0.1*s);
  }
  if (level >= 1) {
    const s = Math.min((level-1)/2, 1);
    text = _ocDropChar(text, 0.04*s);
    text = _ocDoubleChar(text, 0.04*s);
    text = _ocApplyToChars(text, 0.06*s, _ocAdjacentKey);
    text = _ocHomoSwap(text, 0.3*s);
  }
  if (level >= 3) {
    const s = Math.min((level-3)/2, 1);
    text = _ocScramble(text, 0.4*s + 0.1);
    text = _ocDropChar(text, 0.08*s);
    text = _ocRandomCase(text, 0.15*s);
  }
  if (level >= 5) {
    const s = Math.min((level-5)/5, 1);
    const alpha = [...'abcdefghijklmnopqrstuvwxyz'];
    text = _ocInjectRandom(text, 0.1*s);
    text = _ocApplyToChars(text, 0.2*s, () => _ocPick(alpha));
    text = _ocRandomCase(text, 0.4*s);
    if (s > 0.6) {
      const words = text.split(/\s+/);
      for (let i = words.length-1; i > 0; i--) {
        const j = Math.floor(_ocR()*(i+1)); [words[i], words[j]] = [words[j], words[i]];
      }
      text = words.join(' ');
    }
  }
  return text;
}
