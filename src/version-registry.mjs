export class VersionRegistry {
  constructor(config) {
    this.defaultVersionId = config.defaultVersionId || "";
    this.versions = new Map();

    for (const version of config.versions || []) {
      this.versions.set(version.id, {
        id: version.id,
        name: version.name,
        description: version.description || "",
        status: version.status || "active",
        tags: Array.isArray(version.tags) ? version.tags : [],
        workingDirectory: version.workingDirectory,
        sourceDirs: Array.isArray(version.sourceDirs) ? version.sourceDirs : []
      });
    }
  }

  listPublicVersions() {
    return [...this.versions.values()].map((version) => toPublicVersion(version));
  }

  getVersion(versionId) {
    const id = String(versionId || "").trim();
    return this.versions.get(id) || null;
  }

  requireVersion(versionId) {
    const id = String(versionId || "").trim();

    if (!id) {
      throw new VersionError("请选择版本后再提问。", 400);
    }

    const version = this.getVersion(id);

    if (!version) {
      throw new VersionError(`版本不存在：${id}`, 400);
    }

    if (version.status === "disabled") {
      throw new VersionError(`版本已停用：${id}`, 400);
    }

    return version;
  }

  getDefaultVersion() {
    return this.getVersion(this.defaultVersionId) || [...this.versions.values()][0] || null;
  }

  getPublicDefaultVersionId() {
    return this.getDefaultVersion()?.id || "";
  }
}

export class VersionError extends Error {
  constructor(message, statusCode = 400) {
    super(message);
    this.name = "VersionError";
    this.statusCode = statusCode;
  }
}

function toPublicVersion(version) {
  return {
    id: version.id,
    name: version.name,
    description: version.description,
    status: version.status,
    tags: version.tags,
    sourceCount: version.sourceDirs.length
  };
}
