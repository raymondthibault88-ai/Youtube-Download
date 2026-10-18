const conversionConfig = require('../../../shared/conversion-config.json');
function getSpeedProfile(profileId) {
  return (
    conversionConfig.speedProfiles.find((profile) => profile.id === profileId) ||
    conversionConfig.speedProfiles[0]
  );
}

function getTargetVideoBitrate(height, sourceBitrate, profileId = 'fast') {
  const resolutionProfile =
    conversionConfig.profiles.find((entry) => height >= entry.minHeight) ||
    conversionConfig.profiles.at(-1);
  const speedProfile = getSpeedProfile(profileId);
  const sourceAdjusted =
    sourceBitrate > 0
      ? Math.max(
          conversionConfig.minimumVideoBitrate,
          Math.round(sourceBitrate * conversionConfig.sourceBitrateFactor)
        )
      : resolutionProfile.videoBitrate;
  return Math.max(
    conversionConfig.minimumVideoBitrate,
    Math.round(
      Math.min(resolutionProfile.videoBitrate, sourceAdjusted) * speedProfile.bitrateFactor
    )
  );
}

function estimateOutputSize(mediaInfo, targetHeight, profileId = 'fast') {
  if (!mediaInfo.duration) return null;
  const effectiveHeight = targetHeight
    ? Math.min(targetHeight, mediaInfo.height || targetHeight)
    : mediaInfo.height || 1080;
  const bitrate = getTargetVideoBitrate(effectiveHeight, mediaInfo.bitrate, profileId);
  return Math.round(((bitrate + conversionConfig.audioBitrate) * mediaInfo.duration) / 8);
}

function buildOutputOptions(mediaInfo) {
  const heights = conversionConfig.resolutions.filter((height) => height < mediaInfo.height);
  const options = [
    { height: null, label: `Original · ${mediaInfo.height || '?'}p` },
    ...heights.map((height) => ({ height, label: `${height}p` }))
  ];
  return options.map((option) => ({
    ...option,
    estimates: Object.fromEntries(
      conversionConfig.speedProfiles.map((profile) => [
        profile.id,
        estimateOutputSize(mediaInfo, option.height, profile.id)
      ])
    )
  }));
}
module.exports = { getSpeedProfile, getTargetVideoBitrate, estimateOutputSize, buildOutputOptions };
