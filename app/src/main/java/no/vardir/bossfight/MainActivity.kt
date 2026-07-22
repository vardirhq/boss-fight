package no.vardir.bossfight

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent {
            BossFightTheme {
                BossFightApp()
            }
        }
    }
}

private data class Attack(
    val title: String,
    val damage: Int,
    val player: String,
)

private data class BattleLog(
    val attack: String,
    val damage: Int,
    val hpLeft: Int,
)

@Composable
private fun BossFightApp() {
    val maxHp = 120
    var hp by remember { mutableIntStateOf(maxHp) }
    val log = remember { mutableStateListOf<BattleLog>() }
    val attacks = remember {
        listOf(
            Attack("Start a load", 12, "Chris"),
            Attack("Hang clothes", 18, "Marthe"),
            Attack("Fold the pile", 28, "Chris"),
            Attack("Pair the socks", 14, "Alma"),
            Attack("Put clothes away", 32, "Party"),
            Attack("Clear floor socks", 16, "Amund"),
        )
    }

    val defeated = hp == 0

    Surface(
        modifier = Modifier.fillMaxSize(),
        color = Ink,
    ) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .background(
                    Brush.verticalGradient(
                        colors = listOf(Ink, Color(0xFF1D2330), Color(0xFF11141C))
                    )
                )
                .verticalScroll(rememberScrollState())
                .padding(20.dp),
            verticalArrangement = Arrangement.spacedBy(18.dp),
        ) {
            Header()
            BossCard(
                hp = hp,
                maxHp = maxHp,
                defeated = defeated,
                onReset = {
                    hp = maxHp
                    log.clear()
                },
            )
            AttackPanel(
                attacks = attacks,
                disabled = defeated,
                onAttack = { attack ->
                    val nextHp = (hp - attack.damage).coerceAtLeast(0)
                    hp = nextHp
                    log.add(0, BattleLog(attack.title, attack.damage, nextHp))
                },
            )
            PartyPanel(attacks = attacks, log = log)
            BattleLogPanel(log = log)
        }
    }
}

@Composable
private fun Header() {
    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Text(
            text = "Boss Fight",
            color = Linen,
            fontSize = 34.sp,
            fontWeight = FontWeight.Black,
        )
        Text(
            text = "Make the annoying house jobs lose HP.",
            color = Mist,
            fontSize = 16.sp,
        )
    }
}

@Composable
private fun BossCard(
    hp: Int,
    maxHp: Int,
    defeated: Boolean,
    onReset: () -> Unit,
) {
    val progress by animateFloatAsState(
        targetValue = hp.toFloat() / maxHp,
        label = "Boss HP",
    )

    Card(
        colors = CardDefaults.cardColors(containerColor = Panel),
        border = BorderStroke(1.dp, Stroke),
        shape = RoundedCornerShape(20.dp),
    ) {
        Column(
            modifier = Modifier.padding(18.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Column {
                    Text("Laundry Dragon", color = Linen, fontSize = 24.sp, fontWeight = FontWeight.Black)
                    Text("Rage timer: Sunday night", color = Mist, fontSize = 13.sp)
                }
                OutlinedButton(
                    onClick = onReset,
                    colors = ButtonDefaults.outlinedButtonColors(contentColor = Gold),
                    border = BorderStroke(1.dp, Gold.copy(alpha = 0.7f)),
                ) {
                    Text("Reset")
                }
            }

            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .aspectRatio(0.95f),
                contentAlignment = Alignment.Center,
            ) {
                Image(
                    painter = painterResource(id = R.drawable.laundry_dragon),
                    contentDescription = "Laundry Dragon boss",
                    modifier = Modifier.fillMaxSize(),
                    contentScale = ContentScale.Fit,
                )
                AnimatedVisibility(
                    visible = defeated,
                    modifier = Modifier.align(Alignment.Center),
                ) {
                    Text(
                        text = "VICTORY",
                        color = Gold,
                        fontSize = 42.sp,
                        fontWeight = FontWeight.Black,
                        textAlign = TextAlign.Center,
                    )
                }
            }

            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                ) {
                    Text("Boss HP", color = Mist, fontWeight = FontWeight.Bold)
                    Text("$hp / $maxHp", color = Linen, fontWeight = FontWeight.Black)
                }
                LinearProgressIndicator(
                    progress = { progress },
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(14.dp)
                        .clip(RoundedCornerShape(999.dp)),
                    color = if (defeated) Win else Danger,
                    trackColor = Color(0xFF303747),
                )
            }
        }
    }
}

@Composable
@OptIn(ExperimentalLayoutApi::class)
private fun AttackPanel(
    attacks: List<Attack>,
    disabled: Boolean,
    onAttack: (Attack) -> Unit,
) {
    SectionCard(title = "Attacks") {
        FlowRow(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(10.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            attacks.forEach { attack ->
                Button(
                    onClick = { onAttack(attack) },
                    enabled = !disabled,
                    shape = RoundedCornerShape(12.dp),
                    colors = ButtonDefaults.buttonColors(
                        containerColor = Gold,
                        contentColor = Color(0xFF20160A),
                        disabledContainerColor = Color(0xFF303747),
                        disabledContentColor = Mist,
                    ),
                ) {
                    Column(horizontalAlignment = Alignment.Start) {
                        Text(attack.title, fontWeight = FontWeight.Black)
                        Text("-${attack.damage} HP", fontSize = 12.sp)
                    }
                }
            }
        }
    }
}

@Composable
private fun PartyPanel(
    attacks: List<Attack>,
    log: List<BattleLog>,
) {
    val players = attacks.map { it.player }.distinct()

    SectionCard(title = "Party") {
        Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
            players.forEach { player ->
                val dealt = log.filter { entry ->
                    attacks.firstOrNull { it.title == entry.attack }?.player == player
                }.sumOf { it.damage }
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Box(
                            modifier = Modifier
                                .size(34.dp)
                                .clip(RoundedCornerShape(10.dp))
                                .background(Color(0xFF2C3548)),
                            contentAlignment = Alignment.Center,
                        ) {
                            Text(player.take(1), color = Gold, fontWeight = FontWeight.Black)
                        }
                        Spacer(Modifier.width(10.dp))
                        Text(player, color = Linen, fontWeight = FontWeight.Bold)
                    }
                    Text("$dealt dmg", color = Mist)
                }
            }
        }
    }
}

@Composable
private fun BattleLogPanel(log: List<BattleLog>) {
    SectionCard(title = "Battle Log") {
        if (log.isEmpty()) {
            Text("No attacks yet. The laundry is getting smug.", color = Mist)
        } else {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                log.take(5).forEach { entry ->
                    Text(
                        text = "${entry.attack} hit for ${entry.damage}. Boss HP: ${entry.hpLeft}",
                        color = Linen,
                        fontSize = 14.sp,
                    )
                }
            }
        }
    }
}

@Composable
private fun SectionCard(
    title: String,
    content: @Composable () -> Unit,
) {
    Card(
        colors = CardDefaults.cardColors(containerColor = Panel.copy(alpha = 0.92f)),
        border = BorderStroke(1.dp, Stroke),
        shape = RoundedCornerShape(18.dp),
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Text(title, color = Linen, fontSize = 20.sp, fontWeight = FontWeight.Black)
            content()
        }
    }
}

@Composable
private fun BossFightTheme(content: @Composable () -> Unit) {
    MaterialTheme(content = content)
}

private val Ink = Color(0xFF11141C)
private val Panel = Color(0xFF1B2130)
private val Stroke = Color(0xFF343C4D)
private val Linen = Color(0xFFF6EBDD)
private val Mist = Color(0xFFB9C0CD)
private val Gold = Color(0xFFF4B942)
private val Danger = Color(0xFFE0564A)
private val Win = Color(0xFF67D391)
