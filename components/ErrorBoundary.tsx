import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Colors } from "@/theme/colors";
import { Fonts } from "@/theme/fonts";

type State = { error: Error | null; resetKey: number };

function FallbackScreen({ onReset }: { onReset: () => void }) {
  return (
    <View style={fb.root}>
      <Text style={fb.wordmark}>STRIKE</Text>
      <Text style={fb.heading}>Noget gik galt</Text>
      <Text style={fb.sub}>Something went wrong</Text>
      <Pressable style={fb.button} onPress={onReset}>
        <Text style={fb.buttonText}>Genstart app · Restart app</Text>
      </Pressable>
    </View>
  );
}

export class ErrorBoundary extends React.Component<{ children: React.ReactNode }, State> {
  state: State = { error: null, resetKey: 0 };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    console.error("[strike/boundary] unhandled render error", error, info);
  }

  handleReset = (): void => {
    this.setState((s) => ({ error: null, resetKey: s.resetKey + 1 }));
  };

  render() {
    if (this.state.error) {
      return <FallbackScreen onReset={this.handleReset} />;
    }
    return (
      <React.Fragment key={this.state.resetKey}>
        {this.props.children}
      </React.Fragment>
    );
  }
}

const fb = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Colors.navy,
    alignItems: "center",
    justifyContent: "center",
    padding: 32,
    gap: 12,
  },
  wordmark: {
    color: Colors.amber,
    fontFamily: Fonts.black,
    fontSize: 36,
    letterSpacing: 4,
    marginBottom: 8,
  },
  heading: {
    color: Colors.textBright,
    fontFamily: Fonts.heading,
    fontSize: 22,
    letterSpacing: 0,
    textAlign: "center",
  },
  sub: {
    color: Colors.textMuted,
    fontFamily: Fonts.body,
    fontSize: 15,
    textAlign: "center",
    letterSpacing: 0,
  },
  button: {
    marginTop: 24,
    backgroundColor: Colors.amber,
    paddingVertical: 14,
    paddingHorizontal: 28,
    borderRadius: 16,
  },
  buttonText: {
    color: Colors.textOnAmber,
    fontFamily: Fonts.heading,
    fontSize: 15,
    letterSpacing: 0,
  },
});
