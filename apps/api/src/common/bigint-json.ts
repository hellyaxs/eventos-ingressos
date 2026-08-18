declare global {
  interface BigInt {
    toJSON(): string;
  }
}

if (typeof BigInt !== 'undefined' && !BigInt.prototype.toJSON) {
  BigInt.prototype.toJSON = function toJSON() {
    return this.toString();
  };
}

export {};
