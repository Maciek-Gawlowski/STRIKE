import { useEffect, useRef, useState } from "react";
import { Animated, Easing, StyleProp, Text, TextStyle } from "react-native";

type Props = {
  value: number;
  style?: StyleProp<TextStyle>;
};

/**
 * Renders an integer that counts up (or down) to `value` in ~300ms on each
 * change. Uses an Animated.Value listener so the displayed number stays a
 * floored integer — no decimals, no jank from re-renders in the JS thread.
 */
export function AnimatedCounter({ value, style }: Props) {
  const anim = useRef(new Animated.Value(0)).current;
  const [display, setDisplay] = useState(0);

  useEffect(() => {
    const listenerId = anim.addListener(({ value: v }) => {
      setDisplay(Math.round(v));
    });

    Animated.timing(anim, {
      toValue: value,
      duration: 300,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start(() => {
      anim.removeListener(listenerId);
      // Guarantee the final value is exact after the animation ends.
      setDisplay(value);
    });

    return () => {
      anim.removeListener(listenerId);
    };
  }, [value]);

  return <Text style={style}>{display}</Text>;
}
