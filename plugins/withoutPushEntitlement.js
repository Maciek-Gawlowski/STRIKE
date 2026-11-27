// STRIKE only schedules LOCAL notifications (protection-zone warnings while
// the phone is in a pocket). It never registers for push.
//
// expo-notifications nevertheless adds the `aps-environment` entitlement
// automatically. Our builds are signed with a local provisioning profile
// (credentialsSource: "local") that has no Push capability, so that one
// entitlement would make every build fail to sign. This plugin removes it.
//
// If push notifications are ever wanted: delete this plugin and regenerate
// the provisioning profile with Push Notifications enabled.
const { withEntitlementsPlist } = require("expo/config-plugins");

module.exports = function withoutPushEntitlement(config) {
  return withEntitlementsPlist(config, (cfg) => {
    delete cfg.modResults["aps-environment"];
    return cfg;
  });
};
