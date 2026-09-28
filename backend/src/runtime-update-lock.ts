let locked = false;
export function isUpdateLocked(): boolean { return locked; }
export function setUpdateLocked(value: boolean): void { locked = value; }
