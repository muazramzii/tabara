import { Ionicons } from "@expo/vector-icons";
import { Tabs } from "expo-router";
import { Platform, StyleSheet, Text, View } from "react-native";
import { TAB_BAR_HEIGHT, theme } from "../../constants/theme";

// Active tab gets a filled icon on a soft sage pill; inactive stays muted and
// outlined. Same five routes as before — nothing added, nothing removed.
function TabIcon({
  name,
  filled,
  label,
  focused,
}: {
  name: keyof typeof Ionicons.glyphMap;
  filled: keyof typeof Ionicons.glyphMap;
  label: string;
  focused: boolean;
}) {
  return (
    <View style={styles.item}>
      <View style={[styles.pill, focused && styles.pillActive]}>
        <Ionicons
          name={focused ? filled : name}
          size={21}
          color={focused ? theme.primaryDark : theme.muted}
        />
      </View>
      <Text style={[styles.label, focused && styles.labelActive]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

export default function TabsLayout() {
  return (
      <Tabs
        screenOptions={{
          // Screens render their own headers now, so the stock one would
          // just duplicate the title.
          headerShown: false,
          tabBarShowLabel: false,
          tabBarStyle: styles.bar,
          tabBarItemStyle: { height: 56 },
        }}
      >
        <Tabs.Screen
          name="index"
          options={{
            tabBarIcon: ({ focused }) => (
              <TabIcon name="home-outline" filled="home" label="Home" focused={focused} />
            ),
          }}
        />
        <Tabs.Screen
          name="history"
          options={{
            tabBarIcon: ({ focused }) => (
              <TabIcon name="receipt-outline" filled="receipt" label="History" focused={focused} />
            ),
          }}
        />
        <Tabs.Screen
          name="add"
          options={{
            tabBarIcon: ({ focused }) => (
              <TabIcon name="add-circle-outline" filled="add-circle" label="Add" focused={focused} />
            ),
          }}
        />
        <Tabs.Screen
          name="insights"
          options={{
            tabBarIcon: ({ focused }) => (
              <TabIcon name="pie-chart-outline" filled="pie-chart" label="Expenses" focused={focused} />
            ),
          }}
        />
        <Tabs.Screen
          name="kapy"
          options={{
            tabBarIcon: ({ focused }) => (
              <TabIcon
                name="chatbubble-ellipses-outline"
                filled="chatbubble-ellipses"
                label="Kapy"
                focused={focused}
              />
            ),
          }}
        />
      </Tabs>
  );
}

const styles = StyleSheet.create({
  bar: {
    backgroundColor: theme.card,
    borderTopColor: theme.border,
    borderTopWidth: 1,
    height: TAB_BAR_HEIGHT,
    paddingTop: 8,
    paddingBottom: Platform.OS === "ios" ? 24 : 8,
  },
  item: { alignItems: "center", justifyContent: "center", width: 66 },
  pill: {
    paddingHorizontal: 16,
    paddingVertical: 3,
    borderRadius: 14,
  },
  pillActive: { backgroundColor: theme.accentSoft },
  label: { fontSize: 10, fontWeight: "700", color: theme.muted, marginTop: 3 },
  labelActive: { color: theme.primaryDark },
});
