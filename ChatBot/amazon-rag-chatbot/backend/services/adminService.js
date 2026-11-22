const { spawn } = require("child_process");
const path = require("path");

/**
 * Service to handle administrative tasks like index rebuilding.
 */
class AdminService {
  constructor() {
    this.pythonPath = "python"; // Assume python is in PATH
    this.indexerScript = path.join(__dirname, "../../rag_model/update_index.py");
    this.isIndexing = false;
  }

  /**
   * Triggers the Python indexing script.
   * @returns {Promise<Object>} Status of the operation.
   */
  async triggerReindex() {
    if (this.isIndexing) {
      throw new Error("Indexing is already in progress.");
    }

    this.isIndexing = true;
    console.log("[Admin] Starting index rebuild...");

    return new Promise((resolve, reject) => {
      const pythonProcess = spawn(this.pythonPath, [this.indexerScript]);

      let output = "";
      let errorOutput = "";

      pythonProcess.stdout.on("data", (data) => {
        output += data.toString();
        // Log progress to console
        process.stdout.write(data);
      });

      pythonProcess.stderr.on("data", (data) => {
        errorOutput += data.toString();
        process.stderr.write(data);
      });

      pythonProcess.on("close", (code) => {
        this.isIndexing = false;
        if (code === 0) {
          console.log("[Admin] Index rebuild completed successfully.");
          resolve({
            success: true,
            message: "Index rebuilt successfully",
            output: output.substring(output.lastIndexOf("=")),
          });
        } else {
          console.error(`[Admin] Indexer failed with code ${code}`);
          reject(new Error(`Indexer failed: ${errorOutput || "Unknown error"}`));
        }
      });
    });
  }

  /**
   * Status check
   */
  getStatus() {
    return { isIndexing: this.isIndexing };
  }
}

module.exports = new AdminService();
