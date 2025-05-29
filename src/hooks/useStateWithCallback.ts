import { useState, useCallback, useRef, useEffect } from 'react';

type StateCallback<T> = (state: T) => void;
type StateSetter<T> = (newState: T | ((prev: T) => T), cb?: StateCallback<T>) => void;

const useStateWithCallback = <T>(initialState: T): [T, StateSetter<T>] => {
  const [state, setState] = useState<T>(initialState);
  const cbRef = useRef<StateCallback<T> | null>(null);

  const updateState = useCallback<StateSetter<T>>((newState, cb) => {
    cbRef.current = cb || null;

    setState(prev => typeof newState === 'function' ? (newState as (prev: T) => T)(prev) : newState);
  }, []);

  useEffect(() => {
    if (cbRef.current) {
      cbRef.current(state);
      cbRef.current = null;
    }
  }, [state]);

  return [state, updateState];
};

export default useStateWithCallback; 