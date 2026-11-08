package com.bioblitz.microsurvival.data

import android.content.Context
import androidx.room.Dao
import androidx.room.Database
import androidx.room.Entity
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.PrimaryKey
import androidx.room.Query
import androidx.room.Room
import androidx.room.RoomDatabase

@Entity(tableName = "run_records")
data class RunRecordEntity(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    val timestamp: Long,
    val score: Int,
    val survivalTimeSec: Int,
    val nutrientsCollected: Int,
    val maxSizeReached: Float,
    val organismId: String
)

@Entity(tableName = "player_settings")
data class PlayerSettingsEntity(
    @PrimaryKey val id: Int = 1,
    val settingsJson: String
)

@Dao
interface BioBlitzDao {
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertRunRecord(record: RunRecordEntity)

    @Query("SELECT * FROM run_records ORDER BY timestamp DESC LIMIT :limit")
    suspend fun getRecentRuns(limit: Int): List<RunRecordEntity>

    @Query("SELECT MAX(score) FROM run_records")
    suspend fun getBestScore(): Int?

    @Query("SELECT MAX(survivalTimeSec) FROM run_records")
    suspend fun getLongestSurvivalSec(): Int?

    @Query("SELECT SUM(nutrientsCollected) FROM run_records")
    suspend fun getTotalNutrientsCollected(): Int?

    @Query("SELECT COUNT(*) FROM run_records")
    suspend fun getTotalGamesPlayed(): Int

    @Query("SELECT SUM(survivalTimeSec) FROM run_records")
    suspend fun getTotalSurvivalTimeSec(): Int?

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun saveSettings(settings: PlayerSettingsEntity)

    @Query("SELECT * FROM player_settings WHERE id = 1 LIMIT 1")
    suspend fun getSettings(): PlayerSettingsEntity?
}

@Database(
    entities = [RunRecordEntity::class, PlayerSettingsEntity::class],
    version = 1,
    exportSchema = false
)
abstract class BioBlitzDatabase : RoomDatabase() {
    abstract fun bioBlitzDao(): BioBlitzDao

    companion object {
        @Volatile
        private var INSTANCE: BioBlitzDatabase? = null

        fun getInstance(context: Context): BioBlitzDatabase {
            return INSTANCE ?: synchronized(this) {
                val instance = Room.databaseBuilder(
                    context.applicationContext,
                    BioBlitzDatabase::class.java,
                    "bioblitz_micro_survival.db"
                ).fallbackToDestructiveMigration().build()
                INSTANCE = instance
                instance
            }
        }
    }
}
